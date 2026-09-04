import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import {
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { WalletController } from './wallet.controller';

/**
 * `POST /wallets/transactions` inscrit une écriture au grand livre. Elle
 * acceptait n'importe quels identifiants de portefeuille — inexistants ou
 * appartenant à deux investisseurs — sans jamais les lire.
 */
describe('WalletController.createTransaction', () => {
  const wallets: Record<string, any> = {
    'w-investisseur-1': {
      id: 'w-investisseur-1',
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: 7,
    },
    'w-investisseur-2': {
      id: 'w-investisseur-2',
      type: WalletType.INVESTISSEUR,
      proprietaireUserId: 8,
    },
    'w-frais': { id: 'w-frais', type: WalletType.FRAIS_PLATEFORME },
    'w-projet': { id: 'w-projet', type: WalletType.TECHNIQUE_PROJET },
  };

  const makeController = (role: UserRole = UserRole.SUPER_ADMIN) => {
    const walletRepository = {
      findWalletById: jest.fn((id: string) =>
        Promise.resolve(wallets[id] ?? null),
      ),
      saveTransaction: jest.fn((tx: any) =>
        Promise.resolve({ ...tx, id: 'tx-1' }),
      ),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role }),
    };
    const auditLog = { create: jest.fn().mockResolvedValue({}) };
    return {
      controller: new WalletController(
        walletRepository as any,
        userRepo as any,
        auditLog as any,
      ),
      walletRepository,
      auditLog,
    };
  };

  const acteur = { userId: 99, email: 'a@b.c', role: UserRole.SUPER_ADMIN } as any;
  const ecriture = (over: Record<string, unknown> = {}) =>
    ({
      montant: 100,
      type: TransactionType.FRAIS,
      ...over,
    }) as any;

  it('refuse une écriture entre deux portefeuilles personnels', async () => {
    const { controller, walletRepository } = makeController();

    await expect(
      controller.createTransaction(
        ecriture({
          walletSourceId: 'w-investisseur-1',
          walletDestinationId: 'w-investisseur-2',
        }),
        acteur,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(walletRepository.saveTransaction).not.toHaveBeenCalled();
  });

  it('refuse un portefeuille source inexistant', async () => {
    const { controller, walletRepository } = makeController();

    await expect(
      controller.createTransaction(
        ecriture({ walletSourceId: 'w-fantome', walletDestinationId: 'w-frais' }),
        acteur,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(walletRepository.saveTransaction).not.toHaveBeenCalled();
  });

  it('refuse un portefeuille destinataire inexistant', async () => {
    const { controller } = makeController();

    await expect(
      controller.createTransaction(
        ecriture({ walletSourceId: 'w-frais', walletDestinationId: 'w-fantome' }),
        acteur,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuse une écriture qui ne désigne aucun portefeuille", async () => {
    const { controller } = makeController();

    await expect(
      controller.createTransaction(ecriture(), acteur),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un rôle sans platform:wallet relu EN BASE, avant toute lecture de portefeuille', async () => {
    const { controller, walletRepository } = makeController(UserRole.COMPLIANCE);

    await expect(
      controller.createTransaction(
        ecriture({
          walletSourceId: 'w-projet',
          walletDestinationId: 'w-investisseur-1',
        }),
        acteur,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(walletRepository.findWalletById).not.toHaveBeenCalled();
  });

  it('accepte une écriture touchant un portefeuille de la plateforme', async () => {
    const { controller, walletRepository } = makeController();

    const tx = await controller.createTransaction(
      ecriture({
        walletSourceId: 'w-projet',
        walletDestinationId: 'w-investisseur-1',
      }),
      acteur,
    );

    expect(walletRepository.saveTransaction).toHaveBeenCalledTimes(1);
    expect(tx).toMatchObject({ walletSource: 'w-projet', montant: 100 });
  });

  it('accepte une écriture sans contrepartie interne (sortie vers la plateforme)', async () => {
    const { controller } = makeController();

    await expect(
      controller.createTransaction(
        ecriture({ walletDestinationId: 'w-frais' }),
        acteur,
      ),
    ).resolves.toBeDefined();
  });

  it("laisse une entrée d'audit nominative", async () => {
    const { controller, auditLog } = makeController();

    await controller.createTransaction(
      ecriture({
        walletSourceId: 'w-projet',
        walletDestinationId: 'w-investisseur-1',
      }),
      acteur,
    );

    expect(auditLog.create).toHaveBeenCalledWith(
      '99',
      UserRole.SUPER_ADMIN,
      'wallet.transaction.manuelle',
      'transaction',
      'tx-1',
      undefined,
      undefined,
      expect.objectContaining({
        montant: 100,
        walletSourceType: WalletType.TECHNIQUE_PROJET,
        walletDestinationType: WalletType.INVESTISSEUR,
      }),
    );
  });
});
