import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { ExpirerSignatureCessionUseCase } from 'src/secondarymarket/applications/usecases/expirer-signature-cession.usecase';
import { FinalizeSignedContractUseCase } from 'src/signatures/applications/usecases/finalize-signed-contract.usecase';

/**
 * Presenter du webhook YouSign — HTTP uniquement (SRP).
 *
 * Le règlement atomique de la signature (souscription initiale ET cession
 * marché secondaire) vivait ici : il est extrait dans
 * `FinalizeSignedContractUseCase`, partagé verbatim avec le parcours
 * d'acceptation certifiée du provider de repli. Ce contrôleur ne porte plus
 * que : la vérification de l'authenticité du webhook (spécifique YouSign) et
 * le routage des événements vers les use cases.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('webhooks/yousign')
export class YouSignWebhookController {
  private readonly logger = new Logger(YouSignWebhookController.name);

  constructor(
    private readonly youSignService: YouSignService,
    private readonly metrics: MetricsPort,
    private readonly expirerSignature: ExpirerSignatureCessionUseCase,
    private readonly finalizeSignedContract: FinalizeSignedContractUseCase,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Body() payload: any,
    @Headers('x-yousign-signature-256') signature: string,
  ) {
    const rawBody = (req.rawBody as Buffer | undefined)?.toString('utf-8') ?? JSON.stringify(payload);

    if (!this.youSignService.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Invalid YouSign webhook signature — ignored');
      this.metrics.incrementCounter(METRIC.WEBHOOK_SIGNATURE_INVALID_TOTAL, {
        provider: 'yousign',
      });
      return { received: false };
    }

    const event = payload?.event_name as string;
    const requestId = payload?.data?.signature_request?.id as string;

    this.logger.log(`YouSign webhook: event=${event} requestId=${requestId}`);

    if (!requestId) return { received: true };

    if (event === 'signature_request.done') {
      await this.finalizeSignedContract.execute(requestId).catch((err) =>
        this.logger.error(`handleSignatureDone failed for ${requestId}: ${err?.message}`, err?.stack),
      );
    } else if (event === 'signature_request.expired') {
      await this.expirerSignature.parRequeteFournisseur(requestId).catch((err) =>
        this.logger.error(`handleSignatureExpired failed for ${requestId}: ${err?.message}`),
      );
    }

    return { received: true };
  }
}
