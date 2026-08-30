import { CreateInvestmentUseCase } from './create-investment.usecase';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import {
  FractionsDemandeesIndisponiblesError,
  SoldeInsuffisantError,
} from 'src/subscription/domain/errors/subscription.errors';

/**
 * Vérifie l'atomicité de la création d'investissement (correctif de survente /
 * double-dépense). Les repos sont mockés ; le cœur monétaire vit dans
 * dataSource.transaction dont le mock invoque le callback avec un EntityManager
 * simulé (verrous pessimistes sur projet + wallet, recompte des fractions sous
 * verrou, débit sous verrou). On prouve : chemin heureux (débit unique +
 * création), solde insuffisant relu SOUS VERROU → throw sans persistance,
 * survente recomptée SOUS VERROU → throw sans persistance, et que les écritures
 * sont bien enveloppées dans la transaction avec verrous.
 *
 * Depuis le passage au modèle riche, les refus sont des **erreurs de domaine**
 * (§21) et non plus des `BadRequestException` : c'est `SubscriptionErrorFilter`
 * qui leur donne un statut HTTP, la couche application n'en connaît aucun.
 */
describe('CreateInvestmentUseCase — atomicité', () => {
  let useCase: CreateInvestmentUseCase;
  let investmentRepository: any;
  let projectRepository: any;
  let walletRepository: any;
  let transactionRepository: any;
  let documentRepository: any;
  let userRepository: any;
  let profilPPRepository: any;
  let contractGenerator: any;
  let cloudStorage: any;
  let notificationEvents: any;
  let eventBus: any;
  let dataSource: any;
  let manager: any;

  // État relu SOUS VERROU dans la transaction (configurable par test).
  let projectRow: any;
  let walletRow: any;
  let lockedSoldTotal: number; // fractions vendues recomptées sous verrou

  const USER_ID = 42;
  const dto: any = { projetId: 'p1', nbFractions: 2 };

  /**
   * L'agrégat `Project` de `catalog` tel que `ProjetSouscriptibleTranslator`
   * le lit : le prix de la fraction et le nombre total de fractions viennent
   * du contexte amont, ils ne sont plus recalculés ici.
   */
  const baseProject = () => ({
    id: 'p1',
    titre: 'Projet Test',
    ville: 'Paris',
    pays: 'FR',
    instrument: 'OBLIGATION',
    statut: ProjectStatus.EN_COLLECTE,
    ticketMaximum: null,
    prixUnitaireFraction: 100,
    nbFractionsTotal: 100,
    triCible: 8,
    dureeMois: 12,
  });

  beforeEach(() => {
    projectRow = { id: 'p1', statut: ProjectStatus.EN_COLLECTE };
    walletRow = { id: 'w1', solde: 1000, devise: 'EUR' };
    lockedSoldTotal = 0;

    investmentRepository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (inv: any) => inv),
    };
    projectRepository = {
      findProjectById: jest.fn().mockResolvedValue(baseProject()),
    };
    walletRepository = {
      findByUser: jest
        .fn()
        .mockResolvedValue({ id: 'w1', solde: 1000, devise: 'EUR' }),
    };
    transactionRepository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    documentRepository = { save: jest.fn().mockResolvedValue({ id: 'd1' }) };
    userRepository = {
      findById: jest.fn().mockResolvedValue({
        userId: USER_ID,
        firstname: 'Jean',
        lastname: 'Test',
        email: 'jean@example.com',
      }),
    };
    // Le port de conformité rend un verdict en deux moitiés, pas un dossier :
    // l'aptitude que décide l'entrée en relation, le classement que décide
    // l'adéquation. Sans questionnaire, le titulaire est non averti et se voit
    // opposer le plancher réglementaire.
    profilPPRepository = {
      eligibilite: jest.fn().mockResolvedValue({
        investorId: 1,
        societeId: null,
        aptitude: { peutOperer: true, motifs: [] },
        classement: {
          categoriePsfp: 'non_averti',
          estNonAverti: true,
          plafondConseille: null,
          patrimoineDeclare: null,
        },
      }),
    };
    contractGenerator = {
      generateBulletin: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    cloudStorage = {
      upload: jest.fn().mockResolvedValue({ objectName: 'o', publicUrl: 'u' }),
    };
    notificationEvents = { investmentCreated: jest.fn() };
    eventBus = { publish: jest.fn() };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === ProjectEntity) return projectRow;
        if (entity === WalletEntity) return walletRow;
        return null;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValue({ total: String(lockedSoldTotal) }),
      })),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === InvestmentEntity) return { ...obj, id: 'inv-1' };
        return obj;
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    useCase = new CreateInvestmentUseCase(
      investmentRepository,
      projectRepository,
      walletRepository,
      transactionRepository,
      documentRepository,
      userRepository,
      profilPPRepository,
      contractGenerator,
      cloudStorage,
      notificationEvents,
      eventBus,
      dataSource,
    );
  });

  const savedInvestments = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === InvestmentEntity);
  const walletSaves = () =>
    manager.save.mock.calls.filter((c: any) => c[0] === WalletEntity);

  const withLockedFractionsSold = (total: string) => {
    manager.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total }),
    }));
  };

  it('chemin heureux : débite exactement une fois et crée l’investissement dans la transaction', async () => {
    const result = await useCase.execute(USER_ID, dto);

    // La section critique est enveloppée dans UNE transaction.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    // Verrous pessimistes demandés sur projet ET wallet.
    const projLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    const walletLock = manager.findOne.mock.calls.find(
      (c: any) => c[0] === WalletEntity,
    );
    expect(projLock[1].lock).toEqual({ mode: 'pessimistic_write' });
    expect(walletLock[1].lock).toEqual({ mode: 'pessimistic_write' });

    // L'investissement est persisté exactement une fois via le manager.
    expect(savedInvestments()).toHaveLength(1);

    // Débit unique : solde relu (1000) − montant (2 × 100) = 800.
    expect(walletSaves()).toHaveLength(1);
    expect(walletSaves()[0][1].solde).toBe(800);

    // La transaction ledger est écrite dans la même transaction.
    const txSaves = manager.save.mock.calls.filter(
      (c: any) => c[0] === TransactionEntity,
    );
    expect(txSaves).toHaveLength(1);
    expect(txSaves[0][1].montant).toBe(200);

    expect(result.id).toBe('inv-1');
    expect(result.montant).toBe(200);
    expect(result.statut).toBe(InvestmentStatus.CONFIRME);
  });

  it('solde insuffisant relu SOUS VERROU → throw, rien n’est persisté', async () => {
    // Le wallet lu hors transaction affiche 1000, celui relu sous verrou 50 :
    // seul le contrôle sous verrou tranche.
    walletRow = { id: 'w1', solde: 50, devise: 'EUR' };

    await expect(useCase.execute(USER_ID, dto)).rejects.toBeInstanceOf(
      SoldeInsuffisantError,
    );
    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('survente recomptée SOUS VERROU (nbFractions > disponibles) → throw, rien n’est persisté', async () => {
    // 99 fractions déjà vendues d'après le recompte verrouillé → 1 dispo < 2
    // demandées : c'est `CollecteCapacity` qui refuse.
    withLockedFractionsSold('99');

    await expect(useCase.execute(USER_ID, dto)).rejects.toBeInstanceOf(
      FractionsDemandeesIndisponiblesError,
    );
    expect(savedInvestments()).toHaveLength(0);
    expect(walletSaves()).toHaveLength(0);
  });

  it('projet entièrement vendu → passage FINANCE sous le verrou projet', async () => {
    // 98 déjà vendues + 2 demandées = 100 = total → collecte complète.
    withLockedFractionsSold('98');

    await useCase.execute(USER_ID, dto);

    const projectSave = manager.save.mock.calls.find(
      (c: any) => c[0] === ProjectEntity,
    );
    expect(projectSave).toBeDefined();
    expect(projectSave[1].statut).toBe(ProjectStatus.FINANCE);
  });

  it('retry idempotent : une requête déjà traitée renvoie l’investissement sans entrer dans la transaction', async () => {
    const idemDto = { ...dto, idempotencyKey: 'abc' };
    transactionRepository.findByIdempotencyKey.mockResolvedValue({
      investissementId: 'inv-existing',
    });
    investmentRepository.findById.mockResolvedValue({ id: 'inv-existing' });

    const result = await useCase.execute(USER_ID, idemDto);
    expect(result.id).toBe('inv-existing');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
