import { ExecuteDistributionUseCase } from './execute-distribution.usecase';
import { StatutPeriodeDistribution } from '../../domains/enums/statut-periode-distribution.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

/**
 * Principe du gel des avoirs (docs/adr/ADR-gel-des-avoirs.md) : les avoirs
 * RESTENT, ils ne SORTENT plus. Les crédits entrants — distributions de
 * loyers — sont donc versés au wallet d'un compte gelé exactement comme à
 * n'importe quel autre.
 *
 * Ce spec est une CARACTÉRISATION : `ExecuteDistributionUseCase` ne dépend
 * d'aucune garde de gel (aucun `GelDesAvoirsPort` dans son constructeur) et
 * ne consulte jamais `users.avoirsGelesLe` — le versement d'une part à un
 * investisseur gelé aboutit. Toute introduction future d'un blocage sur ce
 * chemin ferait échouer ces tests, à dessein.
 */
describe('ExecuteDistributionUseCase — compte gelé : les crédits entrants restent versés', () => {
  const USER_GELE = 10; // investisseur3@beown.fr sur la base dev — gelé dans ce scénario

  let useCase: ExecuteDistributionUseCase;
  let partRepo: any;
  let incrementsParWallet: Map<string, number>;

  const fakeUpdateBuilder = () => {
    let montant = 0;
    let walletId = '';
    const builder: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameter: jest.fn((_nom: string, valeur: number) => {
        montant = Number(valeur);
        return builder;
      }),
      where: jest.fn((_clause: string, params: { id: string }) => {
        walletId = params.id;
        return builder;
      }),
      execute: jest.fn(async () => {
        incrementsParWallet.set(
          walletId,
          (incrementsParWallet.get(walletId) ?? 0) + montant,
        );
        return { affected: 1 };
      }),
    };
    return builder;
  };

  beforeEach(() => {
    incrementsParWallet = new Map();

    const periodeRepo: any = {
      findById: jest.fn().mockResolvedValue({
        id: 'per1',
        projetId: 'p1',
        periode: '2026-08',
        totalLoyers: 1000,
        statut: StatutPeriodeDistribution.VALIDEE,
        distribueeLe: null,
        // Frais à zéro : le scénario isole le versement de la part.
        fraisPlateformeAnnuel: 0,
        fraisGestionLocative: 0,
        fraisPlafonnes: false,
      }),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    partRepo = {
      findByPeriode: jest.fn().mockResolvedValue([
        {
          id: 'part1',
          investissementId: 'inv1',
          montantNet: 250,
          prelevementIR: 0,
          prelevementCSG: 0,
        },
      ]),
      markPaid: jest.fn().mockResolvedValue(undefined),
    };
    const investmentRepo: any = {
      findInvestmentById: jest
        .fn()
        .mockResolvedValue({ id: 'inv1', utilisateurId: USER_GELE }),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: any) => {
        const em: any = {
          findOne: jest.fn().mockImplementation((_entity: any, opts: any) => {
            if (
              opts?.where?.type === WalletType.INVESTISSEUR &&
              opts?.where?.proprietaireUserId === USER_GELE
            ) {
              return Promise.resolve({
                id: 'w-gele',
                proprietaireUserId: USER_GELE,
                type: WalletType.INVESTISSEUR,
                devise: 'EUR',
                solde: 0,
              });
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((_entity, obj) => obj),
          save: jest.fn().mockImplementation((_entity, obj) =>
            Promise.resolve({ ...obj, id: obj.id ?? 'tx-1' }),
          ),
          createQueryBuilder: jest.fn(fakeUpdateBuilder),
        };
        return cb(em);
      }),
    };

    useCase = new ExecuteDistributionUseCase(
      periodeRepo,
      partRepo,
      investmentRepo,
      {} as any, // walletRepo (non utilisé sur ce chemin)
      {} as any, // txRepo (non utilisé sur ce chemin)
      dataSource,
      { create: jest.fn().mockResolvedValue(undefined) } as any, // auditLog
      { check: jest.fn().mockResolvedValue(undefined) } as any, // amlMonitor
      {
        incrementCounter: jest.fn(),
        observeHistogram: jest.fn(),
        setGauge: jest.fn(),
      } as any, // metrics
      { push: jest.fn().mockResolvedValue(undefined) } as any, // notifications
      { findProjectById: jest.fn().mockResolvedValue(null) } as any, // projectRepo
      { distributionRecue: jest.fn().mockResolvedValue(undefined) } as any, // emails
      {
        executeInTransaction: jest
          .fn()
          .mockResolvedValue({ id: 'w-projet', solde: 10_000, devise: 'EUR' }),
      } as any, // projectWalletResolver
      { surPartPayee: jest.fn().mockResolvedValue(undefined) } as any, // reinvestirLoyers
    );
  });

  it("verse la part d'un investisseur gelé : wallet crédité, part marquée payée", async () => {
    const resultat = await useCase.execute('per1');

    expect(resultat.nbPartsPayees).toBe(1);
    expect(resultat.nbPartsSkipped).toBe(0);
    expect(resultat.totalNetVerse).toBe(250);
    // Le wallet de l'investisseur gelé est bien CRÉDITÉ.
    expect(incrementsParWallet.get('w-gele')).toBe(250);
    expect(partRepo.markPaid).toHaveBeenCalledWith('part1', expect.any(Date));
  });

  it("le usecase n'a AUCUNE dépendance de gel : pas de GelDesAvoirsPort dans sa construction", () => {
    // Verrou structurel : le constructeur ci-dessus est EXHAUSTIF (14
    // collaborateurs) et aucun n'est une garde de gel. Si quelqu'un ajoute la
    // garde ici, ce compte change — et ce test documente que l'absence de
    // garde sur les crédits entrants est un choix, pas un oubli.
    expect(ExecuteDistributionUseCase.length).toBe(14);
  });
});
