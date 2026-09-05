import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { ExpirerSignatureCessionUseCase } from 'src/secondarymarket/applications/usecases/expirer-signature-cession.usecase';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { FinalizeSignedContractUseCase } from 'src/signatures/applications/usecases/finalize-signed-contract.usecase';

/**
 * Événements du prestataire signifiant que la signature n'aura PAS lieu.
 *
 * `declined` : le signataire a explicitement refusé. `canceled` : le parcours
 * a été annulé (par nous, ou côté prestataire). Les deux formes d'orthographe
 * sont acceptées — le prestataire n'a pas toujours été constant.
 */
const EVENEMENTS_REFUS = [
  'signature_request.declined',
  'signature_request.canceled',
  'signature_request.cancelled',
];

/**
 * Presenter du webhook YouSign — HTTP uniquement (SRP).
 *
 * Le règlement atomique de la signature (souscription initiale ET cession
 * marché secondaire) vivait ici : il est extrait dans
 * `FinalizeSignedContractUseCase`, partagé verbatim avec le parcours
 * d'acceptation certifiée du provider de repli. Ce contrôleur ne porte plus
 * que : la vérification de l'authenticité du webhook (spécifique YouSign) et
 * le routage des événements vers les use cases.
 *
 * ## Authenticité — la seule barrière
 *
 * La route est `@Public()` : ni jeton, ni session, ni rôle. La signature HMAC
 * est donc le SEUL contrôle d'accès d'un point d'entrée qui finalise des
 * contrats et déplace des fonds. Un appel non authentifié est refusé en 401 —
 * et non absorbé par un 200 « received: false », qui donnait à un appelant
 * illégitime la même réponse qu'à YouSign et n'apparaissait nulle part comme
 * un refus côté client.
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
      // Le motif exact — signature fausse, ou secret non configuré — est
      // journalisé par le service, côté serveur uniquement. La réponse, elle,
      // reste muette : elle ne renseigne pas un appelant illégitime sur l'état
      // de la configuration.
      this.logger.warn(
        'Webhook YouSign refusé : authenticité non établie — aucun événement traité.',
      );
      this.metrics.incrementCounter(METRIC.WEBHOOK_SIGNATURE_INVALID_TOTAL, {
        provider: 'yousign',
      });
      throw new UnauthorizedException('Webhook non authentifié.');
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
    } else if (EVENEMENTS_REFUS.includes(event)) {
      // REFUS ou ANNULATION du parcours de signature.
      //
      // Ces événements n'étaient routés NULLE PART : la signature restait
      // PENDING, l'annonce restait bloquée en `accepte` hors du carnet, et les
      // fonds de l'acheteur restaient réservés — jusqu'à ce que le balayeur
      // des ordres orphelins passe, des heures plus tard. Le vendeur perdait
      // son annonce et l'acheteur son argent pour un refus dont la plateforme
      // était pourtant informée à la seconde.
      //
      // La compensation est immédiate, et la signature est marquée CANCELLED
      // et non EXPIRED : un refus n'est pas un oubli.
      await this.expirerSignature
        .parRequeteFournisseur(requestId, SignatureStatus.CANCELLED)
        .catch((err) =>
          this.logger.error(
            `Annulation de cession non traitée pour ${requestId} : ${err?.message}`,
          ),
        );
    }

    return { received: true };
  }
}
