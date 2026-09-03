import { ExecuteDistributionUseCase } from './execute-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import {
  grandLivreEquilibre,
  mouvementsDepuisInstantanes,
  rapprocherGrandLivre,
  variationTotale,
  TOLERANCE_INVARIANT_EUR,
  type EcritureGrandLivre,
  type MouvementWallet,
  type PositionWallet,
} from 'src/wallets/domains/grand-livre';

/**
 * INVARIANT COMPTABLE DE L'EXÉCUTION D'UNE DISTRIBUTION.
 *
 * Depuis le câblage du portefeuille TECHNIQUE_PROJET comme contrepartie
 * débitrice, une distribution EST une opération purement interne : les loyers
 * sont entrés dans le registre EN AMONT, quand le porteur a alimenté le
 * portefeuille technique du projet (`APPORT_PORTEUR`). L'exécution ne fait
 * que VENTILER ce que le projet détient déjà — la somme des variations sur
 * l'ensemble des portefeuilles doit donc valoir exactement zéro, sans aucune
 * contrepartie externe à rendre explicite.
 *
 * Ce que l'on vérifie est la double entrée écrite en toutes lettres :
 *
 *  1. RAPPROCHEMENT — pour CHAQUE portefeuille, la variation de fonds détenus
 *     égale « Σ crédits − Σ débits » reconstitués depuis les écritures. C'est
 *     ce contrôle, et lui seul, qui attrape un crédit de portefeuille sans
 *     écriture au registre (de l'argent qui apparaît hors du grand livre) ou
 *     une écriture inscrite du mauvais côté.
 *
 *  2. SOMME NULLE sur l'ensemble des portefeuilles, wallet projet compris :
 *     tout ce que la période verse (net, IR, CSG, frais) sort du portefeuille
 *     du projet et de nulle part ailleurs. Rien n'est créé, tout vient de
 *     quelque part — et chaque écriture porte le wallet projet en source.
 *
 * Scénario : trois investisseurs, une période portant deux frais plateforme,
 * prélèvements IR et CSG sur chaque part. Le projet est alimenté d'exactement
 * ce que la période coûte : il doit finir à zéro.
 */
describe('ExecuteDistributionUseCase — invariant comptable (3 investisseurs)', () => {
  const FRAIS_PLATEFORME_ANNUEL = 50;
  const FRAIS_GESTION_LOCATIVE = 70;

  /** Coût total de la période : 600 net + 76,8 IR + 103,2 CSG + 120 frais. */
  const COUT_TOTAL_PERIODE = 900;

  /** Trois parts, montants choisis sans arrondi flottant piégeux. */
  const PARTS = [
    { id: 'part-1', investissementId: 'inv-1', montantNet: 100, prelevementIR: 12.8, prelevementCSG: 17.2 },
    { id: 'part-2', investissementId: 'inv-2', montantNet: 200, prelevementIR: 25.6, prelevementCSG: 34.4 },
    { id: 'part-3', investissementId: 'inv-3', montantNet: 300, prelevementIR: 38.4, prelevementCSG: 51.6 },
  ];

  const INVESTISSEMENTS: Record<string, { id: string; utilisateurId: number }> = {
    'inv-1': { id: 'inv-1', utilisateurId: 11 },
    'inv-2': { id: 'inv-2', utilisateurId: 22 },
    'inv-3': { id: 'inv-3', utilisateurId: 33 },
  };

  let wallets: Record<string, any>;
  let ecritures: EcritureGrandLivre[];
  let useCase: ExecuteDistributionUseCase;
  let notificationService: any;
  let transactionalEmails: any;
  let partRepo: any;

  /** Instantané des positions de TOUS les portefeuilles. */
  const snapshot = (): Map<string, PositionWallet> =>
    new Map(
      Object.values(wallets).map((w: any) => [
        w.id,
        { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
      ]),
    );

  /**
   * Query builder simulé de `UPDATE wallet SET solde = solde ± :montant` :
   * applique réellement l'incrément sur la ligne en mémoire, ce qui rend les
   * instantanés avant/après significatifs. Le SENS de l'opération (crédit ou
   * débit du wallet projet) est porté par l'expression SQL passée à `set` —
   * on l'inspecte pour appliquer le bon signe, sinon les débits du projet
   * seraient rejoués en crédits et l'invariant ne prouverait rien.
   */
  const fakeUpdateBuilder = () => {
    let montant = 0;
    let walletId = '';
    let signe = 1;
    const builder: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn((valeurs: any) => {
        const expression =
          typeof valeurs?.solde === 'function' ? String(valeurs.solde()) : '';
        signe = expression.includes('- :montant') ? -1 : 1;
        return builder;
      }),
      setParameter: jest.fn((_nom: string, valeur: number) => {
        montant = Number(valeur);
        return builder;
      }),
      where: jest.fn((_clause: string, params: { id: string }) => {
        walletId = params.id;
        return builder;
      }),
      execute: jest.fn(async () => {
        const cible = Object.values(wallets).find((w: any) => w.id === walletId);
        if (!cible) return { affected: 0 };
        cible.solde = Number(cible.solde) + signe * montant;
        return { affected: 1 };
      }),
    };
    return builder;
  };

  beforeEach(() => {
    // Les portefeuilles CRÉDITÉS partent de ZÉRO ; le portefeuille du projet
    // — seule contrepartie débitrice — est alimenté d'exactement ce que la
    // période coûte, comme si le porteur venait de faire son apport.
    wallets = {
      projet: { id: 'w-projet', type: WalletType.TECHNIQUE_PROJET, proprietaireUserId: null, solde: COUT_TOTAL_PERIODE, soldeBloque: 0, devise: 'EUR' },
      investisseur11: { id: 'w-11', type: WalletType.INVESTISSEUR, proprietaireUserId: 11, solde: 0, soldeBloque: 0, devise: 'EUR' },
      investisseur22: { id: 'w-22', type: WalletType.INVESTISSEUR, proprietaireUserId: 22, solde: 0, soldeBloque: 0, devise: 'EUR' },
      investisseur33: { id: 'w-33', type: WalletType.INVESTISSEUR, proprietaireUserId: 33, solde: 0, soldeBloque: 0, devise: 'EUR' },
      frais: { id: 'w-frais', type: WalletType.FRAIS_PLATEFORME, proprietaireUserId: null, solde: 0, soldeBloque: 0, devise: 'EUR' },
      ir: { id: 'w-ir', type: WalletType.SEQUESTRE_IR, proprietaireUserId: null, solde: 0, soldeBloque: 0, devise: 'EUR' },
      csg: { id: 'w-csg', type: WalletType.SEQUESTRE_CSG, proprietaireUserId: null, solde: 0, soldeBloque: 0, devise: 'EUR' },
    };
    ecritures = [];

    const periode: any = {
      id: 'per-1',
      projetId: 'p1',
      periode: '2026-07',
      totalLoyers: 1000,
      statut: StatutPeriodeDistribution.VALIDEE,
      distribueeLe: null,
      fraisPlateformeAnnuel: FRAIS_PLATEFORME_ANNUEL,
      fraisGestionLocative: FRAIS_GESTION_LOCATIVE,
      fraisPlafonnes: false,
    };

    const periodeRepo = {
      findById: jest.fn().mockResolvedValue(periode),
      save: jest.fn().mockImplementation((p: any) => Promise.resolve(p)),
    };
    partRepo = {
      findByPeriode: jest.fn().mockResolvedValue(PARTS),
      markPaid: jest.fn().mockResolvedValue(undefined),
    };
    const investmentRepo = {
      findInvestmentById: jest
        .fn()
        .mockImplementation(async (id: string) => INVESTISSEMENTS[id] ?? null),
    };

    const em: any = {
      findOne: jest.fn(async (_entity: any, opts: any) => {
        const where = opts?.where ?? {};
        if (where.type === WalletType.FRAIS_PLATEFORME) return wallets.frais;
        if (where.type === WalletType.SEQUESTRE_IR) return wallets.ir;
        if (where.type === WalletType.SEQUESTRE_CSG) return wallets.csg;
        if (where.type === WalletType.INVESTISSEUR) {
          return (
            Object.values(wallets).find(
              (w: any) => w.proprietaireUserId === where.proprietaireUserId,
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn((_entity: any, obj: any) => obj),
      save: jest.fn(async (entity: any, obj: any) => {
        // Seules les écritures du registre nous intéressent ici : les crédits
        // de portefeuille passent désormais par l'UPDATE atomique.
        if (entity === TransactionEntity) {
          ecritures.push({
            walletSource: obj.walletSource ?? null,
            walletDestination: obj.walletDestination ?? null,
            montant: Number(obj.montant),
          });
        }
        return obj;
      }),
      createQueryBuilder: jest.fn(fakeUpdateBuilder),
    };
    const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(em)) };

    notificationService = { push: jest.fn().mockResolvedValue(undefined) };
    transactionalEmails = {
      distributionRecue: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new ExecuteDistributionUseCase(
      periodeRepo as any,
      partRepo as any,
      investmentRepo as any,
      {} as any,
      {} as any,
      dataSource,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      { check: jest.fn().mockResolvedValue(undefined) } as any,
      {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any,
      notificationService as any,
      {
        findProjectById: jest
          .fn()
          .mockResolvedValue({ id: 'p1', titre: 'Résidence Horizon' }),
      } as any,
      transactionalEmails as any,
      // Contrepartie débitrice : le portefeuille technique du projet, résolu
      // sous la même transaction que les crédits qu'il finance.
      {
        executeInTransaction: jest.fn(async () => wallets.projet),
      } as any,
      // Réinvestissement (vague C) : stub inerte — logique couverte par ses specs.
      { surPartPayee: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  /**
   * VARIATIONS de position entre deux instantanés, présentées comme des
   * positions : c'est la grandeur comparable au registre de la période. Le
   * wallet projet ne part pas de zéro (il a été alimenté par le porteur en
   * amont), l'instantané d'après ne peut donc plus être rapproché tel quel.
   */
  const variationsCommePositions = (
    avant: ReadonlyMap<string, PositionWallet>,
    apres: ReadonlyMap<string, PositionWallet>,
  ): Map<string, PositionWallet> =>
    new Map(
      [...new Set([...avant.keys(), ...apres.keys()])].map((walletId) => [
        walletId,
        {
          solde:
            Number(apres.get(walletId)?.solde ?? 0) -
            Number(avant.get(walletId)?.solde ?? 0),
          soldeBloque:
            Number(apres.get(walletId)?.soldeBloque ?? 0) -
            Number(avant.get(walletId)?.soldeBloque ?? 0),
        },
      ]),
    );

  it('rapprochement : chaque portefeuille, projet débité compris, varie à hauteur exacte de ses écritures', async () => {
    const avant = snapshot();
    await useCase.execute('per-1');
    const apres = snapshot();

    // La variation de CHAQUE portefeuille — débits du projet inclus — doit
    // égaler « Σ crédits − Σ débits » reconstitués depuis les écritures.
    expect(
      rapprocherGrandLivre(variationsCommePositions(avant, apres), ecritures),
    ).toEqual([]);

    // Contrôle de non-trivialité : de l'argent a bel et bien bougé.
    const mouvements = mouvementsDepuisInstantanes(avant, apres);
    expect(mouvements.length).toBeGreaterThan(0);
  });

  it('Σ des variations = 0 : la distribution est purement interne, financée par le wallet projet', async () => {
    const avant = snapshot();
    await useCase.execute('per-1');
    const apres = snapshot();

    // AUCUNE contrepartie externe : l'argent est entré en amont via
    // APPORT_PORTEUR. Chaque écriture de la période doit donc porter le
    // wallet projet en source — une écriture sans source signalerait un
    // crédit fabriqué hors du grand livre.
    expect(ecritures.every((e) => e.walletSource === 'w-projet')).toBe(true);

    const mouvements: MouvementWallet[] = mouvementsDepuisInstantanes(
      avant,
      apres,
    );

    expect(Math.abs(variationTotale(mouvements))).toBeLessThanOrEqual(
      TOLERANCE_INVARIANT_EUR,
    );
    expect(grandLivreEquilibre(mouvements)).toBe(true);
  });

  it('ventilation exacte : net aux investisseurs, IR et CSG aux séquestres, frais à la plateforme', async () => {
    const resultat = await useCase.execute('per-1');

    expect(resultat.nbPartsPayees).toBe(3);
    expect(resultat.nbPartsSkipped).toBe(0);

    // Un investisseur reçoit son NET, et rien d'autre.
    expect(wallets.investisseur11.solde).toBeCloseTo(100, 2);
    expect(wallets.investisseur22.solde).toBeCloseTo(200, 2);
    expect(wallets.investisseur33.solde).toBeCloseTo(300, 2);

    // Les prélèvements fiscaux sont séquestrés, pas conservés par la plateforme.
    expect(wallets.ir.solde).toBeCloseTo(12.8 + 25.6 + 38.4, 2);
    expect(wallets.csg.solde).toBeCloseTo(17.2 + 34.4 + 51.6, 2);

    // Les frais encaissés sont EXACTEMENT ceux figés sur la période.
    expect(wallets.frais.solde).toBeCloseTo(
      FRAIS_PLATEFORME_ANNUEL + FRAIS_GESTION_LOCATIVE,
      2,
    );

    // Le projet, alimenté d'exactement ce que la période coûte, finit à zéro :
    // tout ce qu'il détenait a été ventilé, rien de plus, rien de moins.
    expect(wallets.projet.solde).toBeCloseTo(0, 2);

    // Aucun euro ne s'est perdu ni créé : le total détenu par l'ensemble des
    // portefeuilles est conservé à l'identique par la distribution.
    const totalPortefeuilles = Object.values(wallets).reduce(
      (somme: number, w: any) => somme + Number(w.solde),
      0,
    );
    expect(totalPortefeuilles).toBeCloseTo(COUT_TOTAL_PERIODE, 2);
  });

  it('chaque part payée est marquée ET annoncée à son bénéficiaire (in-app + e-mail)', async () => {
    await useCase.execute('per-1');

    expect(partRepo.markPaid).toHaveBeenCalledTimes(3);

    // Une notification par bénéficiaire, portant le net, le projet, la période.
    expect(notificationService.push).toHaveBeenCalledTimes(3);
    const destinataires = notificationService.push.mock.calls.map(
      (appel: any[]) => appel[0].utilisateurId,
    );
    expect(destinataires.sort()).toEqual([11, 22, 33]);
    const premier = notificationService.push.mock.calls.find(
      (appel: any[]) => appel[0].utilisateurId === 11,
    )![0];
    expect(premier.message).toContain('Résidence Horizon');
    expect(premier.message).toContain('2026-07');
    expect(premier.metadata).toMatchObject({
      projetId: 'p1',
      periode: '2026-07',
      distributionPartId: 'part-1',
      montantNet: 100,
    });

    expect(transactionalEmails.distributionRecue).toHaveBeenCalledTimes(3);
    expect(transactionalEmails.distributionRecue).toHaveBeenCalledWith(11, {
      montant: 100,
      projetTitre: 'Résidence Horizon',
      periode: '2026-07',
    });
  });

  it('aucune annonce n’est faite avant le commit de la transaction', async () => {
    // Preuve par la place de l'appel : au moment où la transaction s'exécute,
    // aucune notification n'a encore été poussée. Un rollback ultérieur ne
    // pourrait donc pas laisser un investisseur avec l'annonce d'un versement
    // qui n'a jamais eu lieu.
    let notificationsPendantTransaction = -1;
    partRepo.markPaid.mockImplementation(async () => {
      notificationsPendantTransaction = notificationService.push.mock.calls.length;
    });

    await useCase.execute('per-1');

    expect(notificationsPendantTransaction).toBe(0);
    expect(notificationService.push).toHaveBeenCalledTimes(3);
  });
});
