import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionStatus, TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.FINANCIER];

@ApiTags('Admin — Retraits')
@ApiBearerAuth()
@Controller('admin/retraits')
@UseGuards(JwtAuthGuard)
export class AdminRetraitsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly notificationEvents: NotificationEventService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({ summary: 'Marquer un retrait comme traité (statut: REUSSI)' })
  @ApiParam({ name: 'txId', description: 'UUID de la transaction de retrait' })
  @HttpCode(HttpStatus.OK)
  @Post(':txId/mark-processed')
  async markProcessed(@Param('txId') txId: string, @CurrentUser() admin: ActiveUser) {
    await this.assertAdmin(admin.userId);
    const tx = await this.txRepo.findOne({ where: { id: txId } });
    if (!tx) throw new NotFoundException('Transaction introuvable');
    if (tx.type !== TransactionType.RETRAIT) {
      throw new BadRequestException("Cette transaction n'est pas un retrait");
    }
    if (tx.statut === TransactionStatus.REUSSI) return { alreadyProcessed: true, txId };

    tx.statut = TransactionStatus.REUSSI;
    await this.txRepo.save(tx);

    const wallet = await this.walletRepo.findOne({
      where: { id: (tx as any).walletSource ?? (tx as any).walletId },
    });
    if (wallet && wallet.proprietaireUserId) {
      await this.notificationEvents.retraitProcessed(
        wallet.proprietaireUserId,
        Number(tx.montant),
        tx.devise,
        tx.id,
      );
    }
    await this.auditLog.create(
      String(admin.userId),
      UserRole.ADMIN,
      'retrait.process',
      'transaction',
      tx.id,
      undefined,
      undefined,
      { montant: Number(tx.montant), devise: tx.devise },
    );
    return { success: true, txId };
  }
}
