import { BadRequestException } from '@nestjs/common';
import { CancelInvestmentUseCase } from './cancel-investment.usecase';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import {
  mouvementsDepuisInstantanes,
  variationTotale,
  PositionWallet,
} from 'src/wallets/domains/grand-livre';

/**
 * GRAND LIVRE — rétractation pendant le délai de réflexion BeOwn.
 *
 * À la souscription d'un non averti, les fonds n'ont jamais quitté son wallet :
 * ils sont passés du disponible au bloqué. La rétractation fait le mouvement
 * inverse (bloqué → disponible), toujours DANS le même wallet : la somme des
 * fonds détenus, tous wallets confondus, ne bouge pas. Le harnais interprète
 * les UPDATE SQL du use case sur un état en mémoire, puis prouve l'invariant
 * par instantanés avant/après.
 */
describe('CancelInvestmentUseCase — invariant comptable (scénario : rétractation)', () => {
  const USER_ID = 42;
  const INVEST_ID = 'inv-1';
  const MONTANT = 300;

  let invRow: any;
  let walletRow: any;
  let projectWalletRow: any;
  let manager: any;
  let dataSource: any;
  let savedTxs: any[];
  let useCase: CancelInvestmentUseCase;

  const snapshotWallets = (): Map<string, PositionWallet> =>
    new Map(
      [walletRow, projectWalletRow].map((w: any) => [
        w.id,
        { solde: Number(w.solde), soldeBloque: Number(w.soldeBloque ?? 0) },
      ]),
    );

  beforeEach(() => {
    invRow = {
      id: INVEST_ID,
      utilisateurId: USER_ID,
      projetId: 'p1',
      montant: MONTANT,
      statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      delaiRetractationJusquAu: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    };
    // État post-souscription non avertie : 300 € déjà passés en poche bloquée.
    walletRow = { id: 'w1', solde: 700, soldeBloque: 300, devise: 'EUR' };
    // Le wallet projet n'a rien reçu (l'engagement n'était pas définitif).
    projectWalletRow = { id: 'wp1', solde: 0, soldeBloque: 0, devise: 'EUR' };
    savedTxs = [];

    // Query builder simulé : applique réellement les UPDATE du use case sur
    // l'état en mémoire (claim de statut conditionnel + recrédit du wallet).
    const buildQB = () => {
      const qb: any = {
        _entity: null,
        _set: null,
        _params: {} as Record<string, unknown>,
        update(entity: any) {
          qb._entity = entity;
          return qb;
        },
        set(payload: any) {
          qb._set = payload;
          return qb;
        },
        setParameter(key: string, value: unknown) {
          qb._params[key] = value;
          return qb;
        },
        where(_clause: string, params?: Record<string, unknown>) {
          Object.assign(qb._params, params ?? {});
          return qb;
        },
        async execute() {
          if (qb._entity === InvestmentEntity) {
            // Transition conditionnelle CONFIRME/EN_DELAI → RETRACTE.
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
      create: jest.fn((_entity: any, obj: any) => obj),
      save: jest.fn(async (entity: any, obj: any) => {
        if (entity === TransactionEntity) savedTxs.push(obj);
        return obj;
      }),
    };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    useCase = new CancelInvestmentUseCase(dataSource);
  });

  it('rétractation : Σ des variations de solde de TOUS les wallets = 0 (déblocage interne)', async () => {
    const avant = snapshotWallets();

    await useCase.execute(INVEST_ID, USER_ID);

    const apres = snapshotWallets();
    const mouvements = mouvementsDepuisInstantanes(avant, apres);

    // ── INVARIANT COMPTABLE : rien n'est créé ni détruit. ───────────────────
    expect(variationTotale(mouvements)).toBe(0);

    // Le mouvement est interne au wallet investisseur : +300 disponible,
    // −300 bloqué ; le wallet projet ne bouge pas.
    expect(walletRow.solde).toBe(1000);
    expect(walletRow.soldeBloque).toBe(0);
    expect(projectWalletRow.solde).toBe(0);
    expect(invRow.statut).toBe(InvestmentStatus.RETRACTE);

    // Trace ledger : source = destination = wallet investisseur (déblocage),
    // jamais de jambe orpheline. Le type est ESCROW_RELEASE — PAS
    // REMBOURSEMENT_CAPITAL : rien n'est remboursé, les fonds sont LIBÉRÉS de
    // la poche bloquée, et le tableau de bord sommerait sinon la rétractation
    // dans les revenus perçus (cf. commentaire du usecase).
    expect(savedTxs).toHaveLength(1);
    expect(savedTxs[0].type).toBe(TransactionType.ESCROW_RELEASE);
    expect(savedTxs[0].walletSource).toBe('w1');
    expect(savedTxs[0].walletDestination).toBe('w1');
    expect(savedTxs[0].montant).toBe(MONTANT);
    expect(savedTxs[0].idempotencyKey).toBe(`retract:${INVEST_ID}`);
  });

  it('double rétractation : le second appel est rejeté sans aucun mouvement de fonds', async () => {
    await useCase.execute(INVEST_ID, USER_ID);
    const avant = snapshotWallets();

    await expect(useCase.execute(INVEST_ID, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const mouvements = mouvementsDepuisInstantanes(avant, snapshotWallets());
    expect(mouvements).toHaveLength(0);
    expect(savedTxs).toHaveLength(1);
  });
});
