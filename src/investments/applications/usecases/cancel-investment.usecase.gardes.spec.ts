import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CancelInvestmentUseCase } from './cancel-investment.usecase';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  CODE_RETRACTATION_DELAI_EXPIRE,
  CODE_RETRACTATION_INTROUVABLE,
  CODE_RETRACTATION_NON_APPLICABLE,
  CODE_RETRACTATION_NON_PROPRIETAIRE,
  CODE_RETRACTATION_STATUT_INCOMPATIBLE,
  LIBELLE_DELAI_RETRACTATION,
} from 'src/investments/domains/retractation';

/**
 * Gardes de `POST /investments/:id/retract`.
 *
 * L'authentification et le rôle sont posés par les gardes globaux ; ce qui se
 * joue ici est ce que le use case seul peut vérifier : la PROPRIÉTÉ de la
 * souscription, l'état dans lequel elle se trouve, et le fait que chaque refus
 * porte un code exploitable par le front. Un refus ne doit JAMAIS toucher aux
 * fonds ni au grand livre.
 */
describe("CancelInvestmentUseCase — gardes et codes d'erreur", () => {
  const USER_ID = 42;
  const AUTRE_USER = 43;
  const INVEST_ID = 'inv-1';
  const MONTANT = 300;
  const JOUR_MS = 24 * 3600 * 1000;

  let invRow: any;
  let walletRow: any;
  let savedTxs: any[];
  let manager: any;
  let dataSource: any;
  let useCase: CancelInvestmentUseCase;

  /** Corps JSON réellement renvoyé au client par Nest. */
  const corps = (err: unknown): any =>
    (err as { getResponse: () => unknown }).getResponse();

  const construire = (invOverrides: Record<string, unknown> = {}) => {
    invRow = {
      id: INVEST_ID,
      utilisateurId: USER_ID,
      projetId: 'p1',
      montant: MONTANT,
      statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      delaiRetractationJusquAu: new Date(Date.now() + 2 * JOUR_MS),
      ...invOverrides,
    };
    walletRow = { id: 'w1', solde: 700, soldeBloque: 300, devise: 'EUR' };
    savedTxs = [];

    const buildQB = () => {
      const qb: any = {
        _entity: null,
        _set: null,
        _params: {} as Record<string, unknown>,
        update: (entity: any) => ((qb._entity = entity), qb),
        set: (payload: any) => ((qb._set = payload), qb),
        setParameter: (k: string, v: unknown) => ((qb._params[k] = v), qb),
        where: (_c: string, p?: Record<string, unknown>) => (
          Object.assign(qb._params, p ?? {}),
          qb
        ),
        async execute() {
          if (qb._entity === InvestmentEntity) {
            if (invRow.statut !== InvestmentStatus.EN_DELAI_RETRACTATION) {
              return { affected: 0 };
            }
            invRow.statut = qb._set.statut;
            return { affected: 1 };
          }
          if (qb._entity === WalletEntity) {
            const montant = Number(qb._params.montant);
            walletRow.solde = Number(walletRow.solde) + montant;
            walletRow.soldeBloque = Math.max(
              0,
              Number(walletRow.soldeBloque) - montant,
            );
            return { affected: 1 };
          }
          return { affected: 0 };
        },
      };
      return qb;
    };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === InvestmentEntity) return invRow;
        if (entity === WalletEntity) return walletRow;
        return null;
      }),
      createQueryBuilder: jest.fn(() => buildQB()),
      create: jest.fn((_e: any, obj: any) => obj),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === TransactionEntity) savedTxs.push(obj);
        return obj;
      }),
    };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    useCase = new CancelInvestmentUseCase(dataSource);
  };

  /** Aucun effet de bord financier : ni solde, ni poche bloquée, ni écriture. */
  const attendreAucunMouvement = () => {
    expect(walletRow.solde).toBe(700);
    expect(walletRow.soldeBloque).toBe(300);
    expect(savedTxs).toHaveLength(0);
  };

  beforeEach(() => construire());

  it("404 + RETRACTATION_INTROUVABLE quand la souscription n'existe pas", async () => {
    manager.findOne = jest.fn(async () => null);

    const err = await useCase.execute(INVEST_ID, USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect(corps(err).code).toBe(CODE_RETRACTATION_INTROUVABLE);
    expect(savedTxs).toHaveLength(0);
  });

  it('403 + RETRACTATION_NON_PROPRIETAIRE : on ne rétracte que sa propre souscription', async () => {
    const err = await useCase.execute(INVEST_ID, AUTRE_USER).catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(corps(err).code).toBe(CODE_RETRACTATION_NON_PROPRIETAIRE);
    // La souscription d'autrui reste intacte : ni statut, ni fonds touchés.
    expect(invRow.statut).toBe(InvestmentStatus.EN_DELAI_RETRACTATION);
    attendreAucunMouvement();
  });

  it('400 + RETRACTATION_STATUT_INCOMPATIBLE sur une souscription déjà confirmée', async () => {
    construire({ statut: InvestmentStatus.CONFIRME });

    const err = await useCase.execute(INVEST_ID, USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(corps(err).code).toBe(CODE_RETRACTATION_STATUT_INCOMPATIBLE);
    expect(corps(err).message).toContain(InvestmentStatus.CONFIRME);
    attendreAucunMouvement();
  });

  it('400 + RETRACTATION_NON_APPLICABLE pour un investisseur averti (aucune échéance)', async () => {
    construire({ delaiRetractationJusquAu: null });

    const err = await useCase.execute(INVEST_ID, USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(corps(err).code).toBe(CODE_RETRACTATION_NON_APPLICABLE);
    expect(corps(err).expireLe).toBeNull();
    attendreAucunMouvement();
  });

  it("400 + RETRACTATION_DELAI_EXPIRE, avec l'échéance et le libellé unique", async () => {
    const expiree = new Date(Date.now() - JOUR_MS);
    construire({ delaiRetractationJusquAu: expiree });

    const err = await useCase.execute(INVEST_ID, USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(corps(err).code).toBe(CODE_RETRACTATION_DELAI_EXPIRE);
    expect(corps(err).expireLe).toBe(expiree.toISOString());
    expect(corps(err).message).toContain(LIBELLE_DELAI_RETRACTATION);
    attendreAucunMouvement();
  });

  it("aucun message d'erreur ne cite de règlement ni d'autorité", async () => {
    const cas: Array<[Record<string, unknown>, number]> = [
      [{ statut: InvestmentStatus.CONFIRME }, USER_ID],
      [{ delaiRetractationJusquAu: null }, USER_ID],
      [{ delaiRetractationJusquAu: new Date(Date.now() - JOUR_MS) }, USER_ID],
      [{}, AUTRE_USER],
    ];

    for (const [overrides, appelant] of cas) {
      construire(overrides);
      const err = await useCase.execute(INVEST_ID, appelant).catch((e) => e);
      expect(String(corps(err).message)).not.toMatch(
        /2020\/1503|ECSP|PSFP|AMF|AEMF|règlement \(UE\)|art\. ?2[0-9]/i,
      );
    }
  });

  it('atomicité : tout le règlement vit dans UNE seule transaction', async () => {
    await useCase.execute(INVEST_ID, USER_ID);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // Statut, solde et écriture de grand livre passent par le MÊME manager,
    // donc la même transaction : un échec sur l'un annule les autres.
    expect(manager.save).toHaveBeenCalledWith(
      TransactionEntity,
      expect.objectContaining({ idempotencyKey: `retract:${INVEST_ID}` }),
    );
    expect(invRow.statut).toBe(InvestmentStatus.RETRACTE);
    expect(walletRow.solde).toBe(1000);
  });

  it('atomicité : wallet introuvable interrompt AVANT toute écriture de grand livre', async () => {
    manager.findOne = jest.fn(async (entity: any) =>
      entity === InvestmentEntity ? invRow : null,
    );

    const err = await useCase.execute(INVEST_ID, USER_ID).catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    // Le claim de statut a bien eu lieu en mémoire, mais l'exception sort de
    // la callback : TypeORM annule la transaction, donc rien n'est persisté.
    expect(savedTxs).toHaveLength(0);
  });
});
