import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';

const ROLES_LITIGES: string[] = rolesWithPermission('retraits:manage');

/** Borne dure : un back-office qui liste des litiges n'en affiche jamais des milliers. */
const MAX_LITIGES = 200;

/**
 * Litiges bancaires (chargebacks) ouverts sur des dépôts.
 *
 * La branche `charge.dispute.created` du webhook MARQUE le dépôt contesté
 * (`metadata.litige = { disputeId, chargeId, motif, statut, montant,
 * ouvertLe }`) sans rien débiter — le prestataire prélèvera d'office, la
 * plateforme le subit. Cette route rend ces marquages visibles à l'équipe
 * finance, seule habilitée à contester ou régulariser : sans elle, le litige
 * n'existait que dans une notification et dans le tableau de bord Stripe.
 */
@ApiTags('Admin — Litiges bancaires')
@ApiBearerAuth()
@Controller('admin/transactions')
@UseGuards(JwtAuthGuard)
@RequirePermission('retraits:manage')
export class AdminTransactionsLitigesController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /** Défense en profondeur : le rôle est relu EN BASE, pas seulement dans le jeton. */
  private async assertAdmin(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLES_LITIGES.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
  }

  @ApiOperation({
    summary: 'Transactions marquées en litige bancaire (chargeback)',
  })
  @Get('litiges')
  async litiges(@CurrentUser() admin: ActiveUser): Promise<{ items: unknown[] }> {
    await this.assertAdmin(admin.userId);

    // Le marqueur est la CLÉ `litige` du JSONB metadata, posée uniquement par
    // la branche dispute du webhook — les plus récents d'abord.
    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .where("tx.metadata -> 'litige' IS NOT NULL")
      .orderBy('tx.createdAt', 'DESC')
      .take(MAX_LITIGES)
      .getMany();

    return {
      items: rows.map((tx) => {
        const litige = ((tx.metadata ?? {}) as Record<string, any>).litige ?? {};
        return {
          id: tx.id,
          date: tx.createdAt,
          type: tx.type,
          statut: tx.statut,
          montant: Number(tx.montant),
          devise: tx.devise,
          referenceStripe: tx.fournisseurRef ?? null,
          litige: {
            disputeId: litige.disputeId ?? null,
            chargeId: litige.chargeId ?? null,
            motif: litige.motif ?? null,
            statut: litige.statut ?? null,
            montant: litige.montant != null ? Number(litige.montant) : null,
            ouvertLe: litige.ouvertLe ?? null,
          },
        };
      }),
    };
  }
}
