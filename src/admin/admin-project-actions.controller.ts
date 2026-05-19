import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Inject,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { Roles } from 'src/common/auth/roles.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import {
  UserEntity,
  UserRole,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

const ADMIN_ROLES: string[] = [
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.COMPLIANCE,
  UserRole.FINANCIER,
  UserRole.RCCI,
];

const REFUNDABLE_INVESTMENT_STATUSES = [
  InvestmentStatus.CONFIRME,
  InvestmentStatus.SIGNE,
  InvestmentStatus.PAYE,
  InvestmentStatus.INITIE,
  InvestmentStatus.ADEQUATION_OK,
  InvestmentStatus.PAIEMENT_ATTENDU,
];

class CancelCollecteDto {
  reason?: string;
}

@ApiTags('Admin – Project actions')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCIER, UserRole.RCCI)
export class AdminProjectActionsController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly notif: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  private async ensureAdmin(currentUser: ActiveUser): Promise<UserEntity> {
    const u = await this.userRepo.findOne({ where: { userId: currentUser.userId } });
    if (!u || !ADMIN_ROLES.includes(u.role)) {
      throw new ForbiddenException("Accès réservé aux administrateurs.");
    }
    return u;
  }

  @ApiOperation({ summary: 'Annuler la collecte et rembourser tous les investisseurs' })
  @ApiResponse({ status: 200, description: 'Collecte annulée, investisseurs remboursés' })
  @Post('projects/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelCollecte(
    @Param('id') id: string,
    @Body() dto: CancelCollecteDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.ensureAdmin(currentUser);
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const refundable = [
      ProjectStatus.ANNONCE,
      ProjectStatus.PRE_INVESTISSEMENT,
      ProjectStatus.EN_COLLECTE,
    ];
    if (!refundable.includes(project.statut)) {
      throw new ForbiddenException(
        `Annulation impossible depuis le statut "${project.statut}".`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const investments = await manager.find(InvestmentEntity, {
        where: {
          projetId: id,
          statut: In(REFUNDABLE_INVESTMENT_STATUSES),
        },
      });

      let refundedCount = 0;
      let refundedAmount = 0;

      for (const inv of investments) {
        // Find investor wallet (auto-create if missing — defensive)
        let wallet = await manager.findOne(WalletEntity, {
          where: { proprietaireUserId: inv.utilisateurId, type: WalletType.INVESTISSEUR },
        });
        if (!wallet) {
          wallet = manager.create(WalletEntity, {
            proprietaireUserId: inv.utilisateurId,
            type: WalletType.INVESTISSEUR,
            devise: 'XOF',
            solde: 0,
          } as Partial<WalletEntity>);
          wallet = await manager.save(wallet);
        }

        const amount = Number(inv.montant);

        // Credit wallet
        await manager.update(
          WalletEntity,
          { id: wallet.id },
          { solde: () => `solde + ${amount}` } as never,
        );

        // Record transaction
        const tx = manager.create(TransactionEntity, {
          walletSource: null,
          walletDestination: wallet.id,
          montant: amount,
          devise: 'XOF',
          type: TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
          fournisseur: TransactionFournisseur.INTERNE,
          statut: TransactionStatus.REUSSI,
          investissementId: inv.id,
          projetId: project.id,
          metadata: { reason: dto.reason ?? null, triggeredBy: currentUser.userId },
        } as Partial<TransactionEntity>);
        await manager.save(tx);

        // Update investment status
        await manager.update(
          InvestmentEntity,
          { id: inv.id },
          { statut: InvestmentStatus.ANNULE },
        );

        // Notify investor (in-app via WebSocket + DB)
        try {
          await this.notif.push({
            utilisateurId: inv.utilisateurId,
            type: NotificationType.AUTRE,
            titre: `Projet annulé : ${project.titre}`,
            message: `La collecte a été annulée. ${amount.toLocaleString('fr-FR')} XOF ont été recrédités sur votre wallet.${dto.reason ? ` Motif : ${dto.reason}` : ''}`,
            metadata: {
              projectId: project.id,
              projectSlug: project.slug,
              amount,
              reason: dto.reason ?? null,
            },
          });
        } catch {
          // Notification failure non-blocking
        }

        refundedCount += 1;
        refundedAmount += amount;
      }

      // Update project status
      await manager.update(
        ProjectEntity,
        { id },
        {
          statut: ProjectStatus.ANNULE,
          motifAnnulation: dto.reason ?? null,
          annuleLe: new Date(),
        },
      );

      return {
        projectId: id,
        newStatus: ProjectStatus.ANNULE,
        refundedCount,
        refundedAmount,
      };
    });
  }

  @ApiOperation({ summary: 'Publier un projet en mode "annonce" (vitrine)' })
  @Post('projects/:id/publish-annonce')
  @HttpCode(HttpStatus.OK)
  async publishAnnonce(
    @Param('id') id: string,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.ensureAdmin(currentUser);
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Projet introuvable.');
    if (project.statut !== ProjectStatus.BROUILLON) {
      throw new ForbiddenException(
        `Passage en annonce uniquement depuis le statut brouillon.`,
      );
    }
    await this.projectRepo.update(
      { id },
      { statut: ProjectStatus.ANNONCE, datePublication: new Date() },
    );
    return { id, statut: ProjectStatus.ANNONCE };
  }

}
