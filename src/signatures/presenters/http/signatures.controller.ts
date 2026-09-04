import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
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
import type { Request } from 'express';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { SignatureProviderExceptionFilter } from 'src/common/yousign/signature-provider-exception.filter';
import { AcknowledgeSignatureUseCase } from 'src/signatures/applications/usecases/acknowledge-signature.usecase';
import { GetSignatureContextUseCase } from 'src/signatures/applications/usecases/get-signature-context.usecase';

/**
 * Presenter du parcours d'acceptation certifiée (provider de repli).
 * HTTP uniquement : contrôles, règlement et certificat vivent dans les use
 * cases. Le `requestId` est l'identifiant externe de la demande (`ack_…`),
 * celui que porte le lien de signature remis à l'acheteur.
 */
@ApiTags('Signatures')
@ApiBearerAuth()
@UseFilters(SignatureProviderExceptionFilter)
@Controller('signatures')
export class SignaturesController {
  constructor(
    private readonly acknowledgeSignature: AcknowledgeSignatureUseCase,
    private readonly getSignatureContext: GetSignatureContextUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Contexte d'une demande de signature (page d'acceptation) : document, récapitulatif, état.",
  })
  @ApiParam({ name: 'requestId', description: 'Identifiant externe de la demande' })
  @Get(':requestId/context')
  async context(
    @Param('requestId') requestId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.getSignatureContext.execute(requestId, user.userId);
  }

  @UseGuards(JwtAuthGuard, KycValidatedGuard)
  @ApiOperation({
    summary:
      "Acceptation certifiée du contrat (provider de repli) : horodatage serveur + IP + " +
      'SHA-256, certificat archivé, puis règlement — le même que le webhook YouSign.',
  })
  @ApiParam({ name: 'requestId', description: 'Identifiant externe de la demande' })
  @ApiResponse({ status: 403, description: 'SIGNATURE_NOT_OWNER / KYC_NOT_VALIDATED' })
  @ApiResponse({ status: 404, description: 'SIGNATURE_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'SIGNATURE_ALREADY_PROCESSED / SIGNATURE_PROVIDER_MISMATCH' })
  @ApiResponse({ status: 410, description: 'SIGNATURE_EXPIRED' })
  @HttpCode(HttpStatus.OK)
  @Post(':requestId/acknowledge')
  async acknowledge(
    @Param('requestId') requestId: string,
    @CurrentUser() user: ActiveUser,
    @Req() req: Request,
  ) {
    // `req.ip` : IP réelle derrière le reverse proxy (`trust proxy` posé dans
    // main.ts) — élément de preuve du certificat.
    return this.acknowledgeSignature.execute(requestId, user.userId, req.ip ?? '');
  }
}
