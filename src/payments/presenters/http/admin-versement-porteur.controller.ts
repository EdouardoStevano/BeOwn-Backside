import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { rolesWithPermission } from 'src/common/auth/permissions.constants';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { Throttle } from '@nestjs/throttler';
import { VerserPorteurUseCase } from '../../applications/usecases/verser-porteur.usecase';
import { VerserPorteurStripeDto } from '../dto/versement-porteur-stripe.dto';

/** Rôles habilités à faire SORTIR de l'argent du back-office. */
const ROLES_FINANCE: string[] = rolesWithPermission('funds:disburse');

/**
 * Palier de débit d'une route qui déplace RÉELLEMENT de l'argent vers
 * l'extérieur. Dix par minute et par appelant : très au-delà de tout usage
 * humain — on ne verse pas dix porteurs par minute — et très en deçà de ce
 * qu'exigerait l'exploitation automatisée d'un jeton administrateur volé.
 * Les trois paliers nommés sont redéfinis, la configuration globale les
 * appliquant tous à chaque route.
 */
const DEBIT_OPERATION_ARGENT = {
  short: { ttl: 60_000, limit: 10 },
  medium: { ttl: 60_000, limit: 10 },
  auth: { ttl: 60_000, limit: 10 },
} as const;

/**
 * Versement au porteur EXÉCUTÉ par la plateforme (Stripe Connect).
 *
 * ⚠ CETTE ROUTE DÉPLACE DE L'ARGENT RÉEL — contrairement à
 * `AdminProjectFinanceController`, qui CONSTATE un virement fait ailleurs. Les
 * deux coexistent volontairement : le constat reste le seul recours pour un
 * virement hors plateforme ou une régularisation, l'exécution devient le
 * chemin nominal.
 *
 * Elle vit dans le module `payments` et non dans `wallets` : c'est là que
 * réside la connaissance du prestataire. `ProjectLedgerService` tire toute sa
 * garantie de son absence de collaborateur externe — y brancher Stripe
 * détruirait cette propriété (cf. ADR-grand-livre-interne, décision 4).
 */
@ApiTags('Admin — Versement porteur (Stripe)')
@ApiBearerAuth()
@Controller('admin/projets')
@UseGuards(JwtAuthGuard)
@RequirePermission('funds:disburse')
export class AdminVersementPorteurController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly verserPorteur: VerserPorteurUseCase,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Défense en profondeur : le rôle est relu EN BASE, pas seulement dans le
   * jeton. Un jeton forgé, ou simplement antérieur au retrait d'un rôle, est
   * refusé ici — sur une route qui fait sortir de l'argent, la fenêtre entre
   * la révocation d'un accès et l'expiration du jeton n'est pas acceptable.
   */
  private async assertFinance(userId: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user || !ROLES_FINANCE.includes(user.role)) {
      throw new ForbiddenException('Accès réservé à l’équipe financière.');
    }
    return user;
  }

  @ApiOperation({
    summary: 'Verser au porteur ce que son projet lui doit (Stripe Connect)',
    description:
      'Débite le portefeuille du projet et achemine les fonds vers le compte ' +
      'connecté du porteur. Le versement est confirmé par le webhook `payout.paid` ; ' +
      'tout échec rapatrie les fonds et recrédite le portefeuille du projet.',
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 202, description: 'Versement engagé (transfer créé)' })
  @ApiResponse({ status: 400, description: 'Montant invalide' })
  @ApiResponse({ status: 403, description: 'Rôle non habilité' })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @ApiResponse({
    status: 409,
    description: 'Porteur sans compte de retrait actif, ou projet sans porteur',
  })
  @ApiResponse({ status: 429, description: 'Trop de demandes — 10 par minute' })
  @Throttle(DEBIT_OPERATION_ARGENT)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/versement-porteur/stripe')
  async verser(
    @Param('id', ParseUUIDPipe) projetId: string,
    @Body() dto: VerserPorteurStripeDto,
    @CurrentUser() user: ActiveUser,
    @Req() request: Request,
  ) {
    const acteur = await this.assertFinance(user.userId);

    const resultat = await this.verserPorteur.execute({
      projetId,
      montant: dto.montant,
      idempotencyKey: dto.idempotencyKey,
      declareParUserId: user.userId,
    });

    // Le journal d'audit trace l'ENGAGEMENT, réussi ou non : une tentative de
    // versement refusée est exactement ce qu'un contrôle veut pouvoir relire.
    await this.auditLog
      .create(
        String(user.userId),
        acteur.role,
        'versement-porteur:stripe',
        'projets',
        projetId,
        request.ip,
        request.headers?.['user-agent'],
        resultat.success
          ? {
              transactionId: resultat.transactionId,
              montant: resultat.montant,
              transferId: resultat.transferId,
              alreadyProcessed: resultat.alreadyProcessed ?? false,
            }
          : { echec: resultat.code },
      )
      .catch(() => {
        // L'échec du journal n'annule pas un versement déjà engagé chez Stripe.
      });

    return resultat;
  }
}
