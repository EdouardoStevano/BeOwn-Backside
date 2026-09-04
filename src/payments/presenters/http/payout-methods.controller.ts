import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { ManagePayoutMethodsUseCase } from '../../applications/usecases/manage-payout-methods.usecase';
import { AttachPayoutMethodDto } from '../dto/payment.dto';
import { PayoutMethodExceptionFilter } from './payout-method-exception.filter';
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';

/**
 * Destinations de retrait de l'investisseur (Lot 4a).
 *
 * SRP — contrôleur SÉPARÉ de `PaymentController` (déjà > 1 000 lignes) : il ne
 * porte que le protocole HTTP de ce domaine et délègue tout le métier à
 * `ManagePayoutMethodsUseCase`.
 *
 * Sécurité :
 *  - `JwtAuthGuard` + `KycValidatedGuard` au niveau de la classe : gérer une
 *    destination de retrait est une action financière, réservée aux profils
 *    KYC validés (403 `KYC_NOT_VALIDATED` sinon) ;
 *  - le compte connecté est TOUJOURS résolu depuis le JWT, jamais reçu du
 *    client : un identifiant de destination appartenant à un tiers renvoie
 *    `NO_PAYOUT_METHOD` (anti-IDOR) ;
 *  - `PayoutMethodExceptionFilter` traduit les codes métier en statuts HTTP
 *    sans laisser fuir le détail technique Stripe.
 */
@ApiTags('Payments & KYC')
@ApiBearerAuth()
// Coordonnées de versement : le masquage par nom de champ ne suffit pas quand
// le prestataire fait évoluer la forme de ses charges utiles.
@AuditSansCorps()
@Controller('payments/connect')
@UseGuards(JwtAuthGuard, KycValidatedGuard)
@UseFilters(PayoutMethodExceptionFilter)
export class PayoutMethodsController {
  constructor(private readonly payoutMethods: ManagePayoutMethodsUseCase) {}

  @ApiOperation({
    summary: 'Lister les destinations de retrait enregistrées',
    description:
      'Source de vérité : Stripe (aucun cache local — ADR-2). `instantEligible` reflète ' +
      '`available_payout_methods` du compte externe. Liste vide si le compte connecté ' +
      "n'existe pas encore.",
  })
  @ApiResponse({ status: 200, description: '{ methods, connectStatus }' })
  @ApiResponse({ status: 403, description: 'KYC non validé' })
  @Get('payout-methods')
  async list(@CurrentUser() user: ActiveUser) {
    return this.payoutMethods.list(user.userId);
  }

  @ApiOperation({
    summary: 'Ajouter une carte de débit comme destination de retrait',
    description:
      'Attend un token Stripe.js (`tok_...`). Le backend ne reçoit jamais de PAN ni de CVC.',
  })
  @ApiResponse({ status: 201, description: 'Destination créée' })
  @ApiResponse({ status: 409, description: 'CONNECT_NOT_READY' })
  @ApiResponse({ status: 422, description: 'CARD_REJECTED' })
  @Post('payout-methods')
  async attach(
    @Body() dto: AttachPayoutMethodDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.payoutMethods.attachCard(user.userId, dto.token);
  }

  @ApiOperation({ summary: 'Supprimer une destination de retrait' })
  @ApiParam({ name: 'id', description: 'Identifiant Stripe de la destination' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({
    status: 409,
    description: 'CANNOT_DELETE_DEFAULT — désigner une autre destination par défaut avant',
  })
  @ApiResponse({ status: 422, description: 'NO_PAYOUT_METHOD' })
  @HttpCode(HttpStatus.OK)
  @Delete('payout-methods/:id')
  async detach(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.payoutMethods.detach(user.userId, id);
    return { success: true };
  }

  @ApiOperation({ summary: 'Définir la destination de retrait par défaut' })
  @ApiParam({ name: 'id', description: 'Identifiant Stripe de la destination' })
  @ApiResponse({ status: 200, description: '{ id, isDefault: true }' })
  @ApiResponse({ status: 422, description: 'NO_PAYOUT_METHOD' })
  @HttpCode(HttpStatus.OK)
  @Patch('payout-methods/:id/default')
  async setDefault(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const method = await this.payoutMethods.setDefault(user.userId, id);
    return { id: method.id, isDefault: method.isDefault };
  }

  @ApiOperation({
    summary: 'Solde du compte connecté, dont la part virable en instantané',
    description: 'Montants en euros (unité majeure), pas en centimes.',
  })
  @ApiResponse({
    status: 200,
    description: '{ available, instantAvailable, currency }',
  })
  @ApiResponse({ status: 409, description: 'CONNECT_NOT_READY' })
  @Get('instant-balance')
  async instantBalance(@CurrentUser() user: ActiveUser) {
    return this.payoutMethods.getInstantBalance(user.userId);
  }
}
