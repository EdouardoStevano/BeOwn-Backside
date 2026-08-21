import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionStatus, TransactionType } from 'src/wallets/domains/enums/wallet.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';

const ADMIN_ROLES: string[] = rolesWithPermission('retraits:manage');
const STATUTS: TransactionStatus[] = Object.values(TransactionStatus);

@ApiTags('Admin — Retraits')
@ApiBearerAuth()
@Controller('admin/retraits')
@UseGuards(JwtAuthGuard)
@RequirePermission('retraits:manage')
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

  private async assertAdmin(userId: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
    return user;
  }

  /**
   * File des demandes de retrait.
   *
   * Sans cette route, un retrait initié par un investisseur ne pouvait JAMAIS
   * être clôturé : `mark-processed` exige un `txId` qu'aucune interface
   * n'exposait. La lecture est gardée par la même permission que l'action
   * (`retraits:manage`, décorateur de classe).
   *
   * Minimisation : `retraits:manage` est détenue par cio et financier, qui
   * n'ont PAS `users:read` (l'annuaire leur a été retiré pour cette raison).
   * On expose donc toujours l'identité du bénéficiaire — sans elle on ne peut
   * pas exécuter un virement — mais l'e-mail seulement aux rôles habilités à
   * lire l'annuaire, avec un drapeau `restricted` pour que le front l'indique.
   */
  @ApiOperation({ summary: 'Liste des demandes de retrait' })
  @ApiQuery({ name: 'statut', required: false, enum: TransactionStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get()
  async list(
    @CurrentUser() admin: ActiveUser,
    @Query('statut') statut?: string,
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const caller = await this.assertAdmin(admin.userId);
    const canReadIdentities = hasPermission(caller.role, 'users:read');

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(limitParam ?? '25', 10) || 25),
    );

    if (statut && !STATUTS.includes(statut as TransactionStatus)) {
      throw new BadRequestException('Statut de transaction inconnu.');
    }

    const [rows, total] = await this.txRepo.findAndCount({
      where: {
        type: TransactionType.RETRAIT,
        ...(statut ? { statut: statut as TransactionStatus } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const beneficiaires = await this.resolveBeneficiaires(rows);

    const items = rows.map((tx) => {
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      const user = beneficiaires.get(tx.id) ?? null;
      return {
        txId: tx.id,
        montant: Number(tx.montant),
        devise: tx.devise,
        statut: tx.statut,
        // La méthode n'a pas de colonne dédiée : elle est portée par le jsonb
        // écrit à la demande de retrait (request-retrait.usecase).
        methode: typeof meta.method === 'string' ? meta.method : null,
        payoutMethod:
          typeof meta.payoutMethod === 'string' ? meta.payoutMethod : null,
        fournisseur: tx.fournisseur,
        motifEchec: tx.motifEchec ?? null,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        utilisateur: user
          ? {
              userId: user.userId,
              nom:
                [user.firstname, user.lastname].filter(Boolean).join(' ') ||
                `Utilisateur #${user.userId}`,
              email: canReadIdentities ? (user.userEmail?.email ?? null) : null,
            }
          : null,
      };
    });

    return { items, total, page, limit, restricted: !canReadIdentities };
  }

  /**
   * Bénéficiaire de chaque retrait, indexé par id de transaction.
   *
   * Deux chemins de résolution parce que les deux existent en base : le jsonb
   * `metadata.userId` (posé par les deux parcours de retrait) et, à défaut, le
   * wallet source — dont l'id vit tantôt sur `walletSource`, tantôt sur
   * `walletId` (colonne `wallet_source`). Les lectures sont groupées : deux
   * requêtes au total, quel que soit le nombre de lignes (pas de N+1).
   */
  private async resolveBeneficiaires(
    rows: TransactionEntity[],
  ): Promise<Map<string, UserEntity>> {
    const parTransaction = new Map<string, number>();
    const walletParTransaction = new Map<string, string>();

    for (const tx of rows) {
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      const userId = Number(meta.userId);
      if (Number.isFinite(userId) && userId > 0) {
        parTransaction.set(tx.id, userId);
        continue;
      }
      const walletId = tx.walletSource ?? tx.walletId;
      if (walletId) walletParTransaction.set(tx.id, walletId);
    }

    if (walletParTransaction.size > 0) {
      const wallets = await this.walletRepo.find({
        where: { id: In([...new Set(walletParTransaction.values())]) },
      });
      const proprietaireParWallet = new Map(
        wallets
          .filter((w) => w.proprietaireUserId != null)
          .map((w) => [w.id, w.proprietaireUserId as number]),
      );
      for (const [txId, walletId] of walletParTransaction) {
        const userId = proprietaireParWallet.get(walletId);
        if (userId != null) parTransaction.set(txId, userId);
      }
    }

    const userIds = [...new Set(parTransaction.values())];
    if (userIds.length === 0) return new Map();

    const users = await this.userRepo.find({ where: { userId: In(userIds) } });
    const parId = new Map(users.map((u) => [u.userId, u]));

    const resultat = new Map<string, UserEntity>();
    for (const [txId, userId] of parTransaction) {
      const user = parId.get(userId);
      if (user) resultat.set(txId, user);
    }
    return resultat;
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
        tx.id,
      );
    }
    await this.auditLog.create(
      String(admin.userId),
      admin.role ?? UserRole.SUPER_ADMIN,
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
