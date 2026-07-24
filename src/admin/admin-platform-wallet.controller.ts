import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletType, TransactionStatus } from 'src/wallets/domains/enums/wallet.enum';

const ADMIN_ROLES: string[] = rolesWithPermission('platform:wallet');

@ApiTags('Admin — Portefeuille plateforme')
@ApiBearerAuth()
@Controller('admin/platform-wallet')
@UseGuards(JwtAuthGuard)
@RequirePermission('platform:wallet')
export class AdminPlatformWalletController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Commissions collectées par la plateforme (super_admin)' })
  @Get()
  async getPlatformWallet(@CurrentUser() admin: ActiveUser) {
    await this.assertAdmin(admin.userId);

    const wallet = await this.walletRepo.findOne({
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    if (!wallet) return { solde: 0, devise: 'EUR', bySource: [], monthly: [] };

    const base = () =>
      this.txRepo
        .createQueryBuilder('tx')
        .where('tx.walletDestination = :id', { id: wallet.id })
        .andWhere('tx.statut = :statut', { statut: TransactionStatus.REUSSI });

    const bySource = await base()
      .select("COALESCE(tx.metadata->>'source', tx.type)", 'source')
      .addSelect('SUM(tx.montant)', 'total')
      .groupBy("COALESCE(tx.metadata->>'source', tx.type)")
      .getRawMany<{ source: string; total: string }>();

    const monthly = await base()
      .select("TO_CHAR(DATE_TRUNC('month', tx.createdAt), 'YYYY-MM')", 'month')
      .addSelect('SUM(tx.montant)', 'total')
      .andWhere("tx.createdAt >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(DATE_TRUNC('month', tx.createdAt), 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; total: string }>();

    return {
      solde: Number(wallet.solde),
      devise: wallet.devise ?? 'EUR',
      bySource: bySource.map((r) => ({ source: r.source, total: Number(r.total) })),
      monthly: monthly.map((r) => ({ month: r.month, total: Number(r.total) })),
    };
  }
}
