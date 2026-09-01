import { ForbiddenException } from '@nestjs/common';
import { AdminPlatformWalletController } from './admin-platform-wallet.controller';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { WalletType, TransactionStatus } from 'src/wallets/domains/enums/wallet.enum';

// Sources canoniques attendues (ordre stable), 0-remplies si absentes en base.
const CANONICAL_SOURCES = [
  'plateforme_annuel',
  'gestion_locative',
  'gain_vente_bien',
  'revente_transaction',
  'gain_revente_actions',
];

describe('AdminPlatformWalletController.getPlatformWallet', () => {
  const admin = { userId: 1 } as any;

  const makeQb = (rawManyResults: unknown[][]) => {
    let call = 0;
    return {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve(rawManyResults[call++] ?? [])),
    };
  };

  const emptyRepo = () => ({ find: jest.fn().mockResolvedValue([]) });

  const build = (overrides: {
    userRepo: any;
    walletRepo: any;
    txRepo: any;
    investRepo?: any;
    projetRepo?: any;
  }) =>
    new AdminPlatformWalletController(
      overrides.userRepo as any,
      overrides.walletRepo as any,
      overrides.txRepo as any,
      (overrides.investRepo ?? emptyRepo()) as any,
      (overrides.projetRepo ?? emptyRepo()) as any,
    );

  it('sans wallet FRAIS_PLATEFORME : zéros, sources canoniques 0-remplies, activité vide', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const walletRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    const txRepo = { createQueryBuilder: jest.fn() };

    const controller = build({ userRepo, walletRepo, txRepo });
    const result = await controller.getPlatformWallet(admin);

    expect(result.solde).toBe(0);
    expect(result.devise).toBe('EUR');
    expect(result.monthly).toEqual([]);
    expect(result.activity).toEqual([]);
    // Toutes les sources canoniques présentes à 0.
    expect(result.bySource).toEqual(
      CANONICAL_SOURCES.map((source) => ({ source, total: 0 })),
    );
    // Trésorerie : même sans aucun wallet, les QUATRE poches système sont
    // rendues à zéro — un séquestre absent serait indistinguable d'un vide.
    expect(result.walletsPlateforme).toEqual([
      { type: WalletType.FRAIS_PLATEFORME, solde: 0, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.SEQUESTRE_IR, solde: 0, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.SEQUESTRE_CSG, solde: 0, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.TAXES, solde: 0, soldeBloque: 0, devise: 'EUR' },
    ]);
    expect(result.walletsTechniques).toEqual([]);
    expect(walletRepo.findOne).toHaveBeenCalledWith({
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('trésorerie : positions des poches système et des wallets techniques, titres résolus en lot', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const walletRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockImplementation(async (opts: any) => {
        if (opts?.where?.type === WalletType.TECHNIQUE_PROJET) {
          return [
            { id: 'w-t1', projetId: 'proj-1', solde: '362913.00', soldeBloque: '0' },
            { id: 'w-t2', projetId: 'proj-2', solde: '100.50', soldeBloque: '25.00' },
          ];
        }
        // Poches système : seuls FRAIS_PLATEFORME et SEQUESTRE_IR existent.
        return [
          { type: WalletType.FRAIS_PLATEFORME, solde: '1000.00', soldeBloque: '0', devise: 'EUR' },
          { type: WalletType.SEQUESTRE_IR, solde: '76.80', soldeBloque: '0', devise: 'EUR' },
        ];
      }),
    };
    const txRepo = { createQueryBuilder: jest.fn() };
    const projetRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'proj-1', titre: 'Résidence Horizon' },
        { id: 'proj-2', titre: 'Villa Azur' },
      ]),
    };

    const controller = build({ userRepo, walletRepo, txRepo, projetRepo });
    const result = await controller.getPlatformWallet(admin);

    expect(result.walletsPlateforme).toEqual([
      { type: WalletType.FRAIS_PLATEFORME, solde: 1000, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.SEQUESTRE_IR, solde: 76.8, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.SEQUESTRE_CSG, solde: 0, soldeBloque: 0, devise: 'EUR' },
      { type: WalletType.TAXES, solde: 0, soldeBloque: 0, devise: 'EUR' },
    ]);
    expect(result.walletsTechniques).toEqual([
      { projetId: 'proj-1', titreProjet: 'Résidence Horizon', solde: 362913, soldeBloque: 0 },
      { projetId: 'proj-2', titreProjet: 'Villa Azur', solde: 100.5, soldeBloque: 25 },
    ]);
  });

  it('agrège bySource (canoniques 0-remplies + extras) / monthly et expose activity', async () => {
    const wallet = { id: 'wallet-1', solde: '1234.56', devise: 'EUR' };
    const bySourceRows = [
      { source: 'gestion_locative', total: '1000.50' },
      { source: 'legacy_frais', total: '234.06' }, // source hors-liste conservée
    ];
    const monthlyRows = [
      { month: '2026-06', total: '600.00' },
      { month: '2026-07', total: '634.56' },
    ];
    const activityRows = [
      {
        id: 'tx-1',
        createdAt: new Date('2026-07-10T00:00:00Z'),
        montant: '1000.50',
        type: 'FRAIS',
        metadata: { source: 'gestion_locative' },
        projetId: 'proj-1',
        investissementId: null,
        idempotencyKey: 'distribution:fee:gestion_locative:per-1',
      },
      {
        id: 'tx-2',
        createdAt: new Date('2026-07-09T00:00:00Z'),
        montant: '234.06',
        type: 'SOUSCRIPTION',
        metadata: { source: 'revente_transaction' },
        projetId: 'proj-2',
        investissementId: 'inv-1',
        idempotencyKey: 'secmarket:fee:revente_transaction:sig:sig-1',
      },
    ];

    const qb = makeQb([bySourceRows, monthlyRows]);
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
      find: jest
        .fn()
        .mockResolvedValue([{ userId: 7, firstname: 'Alice', lastname: 'Martin' }]),
    };
    const walletRepo = {
      findOne: jest.fn().mockResolvedValue(wallet),
      find: jest.fn().mockResolvedValue([]),
    };
    const txRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue(activityRows),
    };
    const investRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: 'inv-1', utilisateurId: 7, projetId: 'proj-2' }]),
    };
    const projetRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'proj-1', titre: 'Résidence A' },
        { id: 'proj-2', titre: 'Résidence B' },
      ]),
    };

    const controller = build({ userRepo, walletRepo, txRepo, investRepo, projetRepo });
    const result = await controller.getPlatformWallet(admin);

    expect(result.solde).toBe(1234.56);
    expect(result.devise).toBe('EUR');

    // Canoniques 0-remplies (dans l'ordre) + extra hors-liste à la fin.
    expect(result.bySource).toEqual([
      { source: 'plateforme_annuel', total: 0 },
      { source: 'gestion_locative', total: 1000.5 },
      { source: 'gain_vente_bien', total: 0 },
      { source: 'revente_transaction', total: 0 },
      { source: 'gain_revente_actions', total: 0 },
      { source: 'legacy_frais', total: 234.06 },
    ]);

    expect(result.monthly).toEqual([
      { month: '2026-06', total: 600 },
      { month: '2026-07', total: 634.56 },
    ]);

    // Activity présente, montants numériques, contrepartie résolue.
    expect(result.activity).toHaveLength(2);
    // Loyer : pas d'investissement → contrepartie = titre du projet.
    expect(result.activity[0]).toMatchObject({
      id: 'tx-1',
      montant: 1000.5,
      source: 'gestion_locative',
      projetId: 'proj-1',
      contrepartie: 'Résidence A',
      reference: 'distribution:fee:gestion_locative:per-1',
    });
    // Revente : investissement → contrepartie = nom de l'investisseur.
    expect(result.activity[1]).toMatchObject({
      id: 'tx-2',
      montant: 234.06,
      source: 'revente_transaction',
      contrepartie: 'Alice Martin',
    });

    // La requête d'activité cible bien les tx réussies du wallet.
    expect(txRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletDestination: 'wallet-1',
          statut: TransactionStatus.REUSSI,
        },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    );
    expect(txRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it("refuse l'accès si l'utilisateur n'a pas la permission platform:wallet", async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 2, role: UserRole.MARKETING }),
    };
    const walletRepo = { findOne: jest.fn() };
    const txRepo = { createQueryBuilder: jest.fn() };

    const controller = build({ userRepo, walletRepo, txRepo });

    await expect(controller.getPlatformWallet({ userId: 2 } as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(walletRepo.findOne).not.toHaveBeenCalled();
  });
});
