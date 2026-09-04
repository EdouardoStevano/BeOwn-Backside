import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { YouSignWebhookController } from './yousign-webhook.controller';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { METRIC } from 'src/observability/metrics/metric-names';

/**
 * Authenticité du webhook YouSign, bout en bout : contrôleur RÉEL et service
 * RÉEL, seule la configuration change.
 *
 * ## Ce qui est en jeu
 *
 * `POST /webhooks/yousign` est `@Public()` et hors throttler : la signature
 * HMAC est son unique contrôle d'accès. Ce qu'elle protège n'est pas une
 * lecture — c'est la finalisation de contrats signés et le règlement des
 * cessions, mouvements de fonds compris.
 *
 * Deux défauts corrigés :
 *  - le service répondait « signature valide » quand le secret n'était pas
 *    configuré (cas par défaut de `.env.example`, sans validation au
 *    démarrage) : le point d'entrée était ouvert, en silence ;
 *  - le contrôleur répondait 200 « received: false » à un appel non
 *    authentifié, indistinguable d'un succès pour l'appelant.
 */
describe('YouSignWebhookController — authenticité (fail-closed)', () => {
  const SECRET = 'secret-webhook-de-test';
  const PAYLOAD = {
    event_name: 'signature_request.done',
    data: { signature_request: { id: 'ys-req-1' } },
  };
  const CORPS = JSON.stringify(PAYLOAD);

  const signer = (corps: string, secret: string) =>
    `sha256=${crypto.createHmac('sha256', secret).update(corps).digest('hex')}`;

  const construire = (secret?: string) => {
    const youSign = new YouSignService({
      get: (cle: string) =>
        ({
          YOUSIGN_BASE_URL: 'https://api-sandbox.yousign.app/v3',
          YOUSIGN_API_KEY: 'cle-de-test',
          YOUSIGN_WEBHOOK_SECRET: secret,
        })[cle],
    } as any);
    // Le journal du refus est vérifié dans `yousign.service.spec.ts` ; ici on
    // le tait pour ne pas polluer la sortie des tests.
    jest.spyOn((youSign as any).logger, 'error').mockImplementation(() => undefined);

    const metrics: any = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    const expirerSignature: any = {
      parRequeteFournisseur: jest.fn().mockResolvedValue('noop'),
    };
    const finalize: any = { execute: jest.fn().mockResolvedValue('noop') };

    const controller = new YouSignWebhookController(
      youSign,
      metrics,
      expirerSignature,
      finalize,
    );
    return { controller, metrics, finalize, expirerSignature };
  };

  /** Requête telle qu'Express la présente, `rawBody` activé dans `main.ts`. */
  const requete = (corps: string) => ({ rawBody: Buffer.from(corps, 'utf-8') });

  it('signature valide → l’événement est traité', async () => {
    const { controller, finalize } = construire(SECRET);

    await expect(
      controller.handleWebhook(
        requete(CORPS),
        PAYLOAD,
        signer(CORPS, SECRET),
      ),
    ).resolves.toEqual({ received: true });

    expect(finalize.execute).toHaveBeenCalledWith('ys-req-1');
  });

  it('signature invalide → 401, rien n’est traité, l’incident est compté', async () => {
    const { controller, metrics, finalize } = construire(SECRET);

    await expect(
      controller.handleWebhook(
        requete(CORPS),
        PAYLOAD,
        signer(CORPS, 'secret-de-l-attaquant'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(finalize.execute).not.toHaveBeenCalled();
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      METRIC.WEBHOOK_SIGNATURE_INVALID_TOTAL,
      { provider: 'yousign' },
    );
  });

  it('en-tête de signature absent → 401', async () => {
    const { controller, finalize } = construire(SECRET);

    await expect(
      controller.handleWebhook(requete(CORPS), PAYLOAD, undefined as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(finalize.execute).not.toHaveBeenCalled();
  });

  it('SECRET NON CONFIGURÉ → 401 : fini le passe-droit', async () => {
    // Le cas exact du défaut : sans secret, ce même appel était traité comme
    // authentique et finalisait le contrat.
    const { controller, finalize, expirerSignature } = construire(undefined);

    await expect(
      controller.handleWebhook(
        requete(CORPS),
        PAYLOAD,
        signer(CORPS, SECRET),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(finalize.execute).not.toHaveBeenCalled();
    expect(expirerSignature.parRequeteFournisseur).not.toHaveBeenCalled();
  });

  it('secret vide (variable déclarée mais non renseignée) → 401 aussi', async () => {
    // C'est littéralement ce que produit une copie de `.env.example`.
    const { controller, finalize } = construire('');

    await expect(
      controller.handleWebhook(requete(CORPS), PAYLOAD, signer(CORPS, SECRET)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(finalize.execute).not.toHaveBeenCalled();
  });

  it('la réponse de refus ne renseigne pas l’appelant sur la configuration', async () => {
    const { controller } = construire(undefined);

    const erreur: unknown = await controller
      .handleWebhook(requete(CORPS), PAYLOAD, signer(CORPS, SECRET))
      .catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(UnauthorizedException);
    // Un même 401, que le secret manque ou que la signature soit fausse : le
    // motif exact reste dans le journal serveur.
    const corps = JSON.stringify(
      (erreur as UnauthorizedException).getResponse(),
    );
    expect(corps).not.toContain('YOUSIGN_WEBHOOK_SECRET');
    expect(corps).not.toContain('secret');
  });
});
