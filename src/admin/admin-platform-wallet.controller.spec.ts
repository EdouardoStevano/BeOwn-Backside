import { ForbiddenException } from '@nestjs/common';
import { AdminPlatformWalletController } from './admin-platform-wallet.controller';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

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

  it('renvoie des zéros et des tableaux vides si aucun wallet FRAIS_PLATEFORME', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const walletRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const txRepo = { createQueryBuilder: jest.fn() };

    const controller = new AdminPlatformWalletController(
      userRepo as any,
      walletRepo as any,
      txRepo as any,
    );

    const result = await controller.getPlatformWallet(admin);

    expect(result).toEqual({ solde: 0, devise: 'EUR', bySource: [], monthly: [] });
    expect(walletRepo.findOne).toHaveBeenCalledWith({
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('agrège bySource/monthly et convertit solde et totaux en nombres', async () => {
    const wallet = { id: 'wallet-1', solde: '1234.56', devise: 'EUR' };
    const bySourceRows = [
      { source: 'commission_investissement', total: '1000.50' },
      { source: 'frais', total: '234.06' },
    ];
    const monthlyRows = [
      { month: '2026-06', total: '600.00' },
      { month: '2026-07', total: '634.56' },
    ];

    const qb = makeQb([bySourceRows, monthlyRows]);
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 1, role: UserRole.SUPER_ADMIN }),
    };
    const walletRepo = { findOne: jest.fn().mockResolvedValue(wallet) };
    const txRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const controller = new AdminPlatformWalletController(
      userRepo as any,
      walletRepo as any,
      txRepo as any,
    );

    const result = await controller.getPlatformWallet(admin);

    expect(result.solde).toBe(1234.56);
    expect(result.devise).toBe('EUR');
    expect(result.bySource).toEqual([
      { source: 'commission_investissement', total: 1000.5 },
      { source: 'frais', total: 234.06 },
    ]);
    expect(result.monthly).toEqual([
      { month: '2026-06', total: 600 },
      { month: '2026-07', total: 634.56 },
    ]);
    expect(txRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it("refuse l'accès si l'utilisateur n'a pas la permission platform:wallet", async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 2, role: UserRole.MARKETING }),
    };
    const walletRepo = { findOne: jest.fn() };
    const txRepo = { createQueryBuilder: jest.fn() };

    const controller = new AdminPlatformWalletController(
      userRepo as any,
      walletRepo as any,
      txRepo as any,
    );

    await expect(controller.getPlatformWallet({ userId: 2 } as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(walletRepo.findOne).not.toHaveBeenCalled();
  });
});
