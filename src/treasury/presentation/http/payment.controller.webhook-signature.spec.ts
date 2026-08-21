import { BadRequestException } from '@nestjs/common';
import { PaymentController } from './payment.controller';

/**
 * L'endpoint webhook est partagé entre paiements et vérification d'identité :
 * un seul secret Stripe, un seul point d'entrée. C'est donc ici, et nulle part
 * ailleurs, que la signature HMAC est éprouvée — un événement dont la signature
 * ne passe pas ne doit atteindre aucun des deux contextes.
 *
 * Ce test vivait dans la spec du webhook Identity ; il en est sorti avec elle
 * lorsque l'interprétation des events `identity.*` a rejoint le contexte KYC
 * (`handle-identity-webhook.usecase.spec.ts`), qui n'a plus à connaître la
 * signature.
 */
describe('PaymentController.handleStripeWebhook — signature', () => {
  let controller: PaymentController;
  let stripeService: any;
  let identityWebhook: any;

  const req = (body: any) =>
    ({ rawBody: Buffer.from(JSON.stringify(body)) }) as any;

  beforeEach(() => {
    stripeService = { constructWebhookEvent: jest.fn() };
    identityWebhook = { handle: jest.fn() };

    controller = new PaymentController(
      stripeService,
      /* stripeConnect */ {} as any,
      /* notificationService */ {} as any,
      /* config */ { get: jest.fn() } as any,
      identityWebhook,
      /* walletRepo */ {} as any,
      /* txRepo */ {} as any,
      /* dataSource */ {} as any,
      /* requestRetrait */ {} as any,
    );
  });

  it('rejette (400) une signature invalide sans traiter aucun event', async () => {
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    await expect(
      controller.handleStripeWebhook('bad-sig', req({ foo: 'bar' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(identityWebhook.handle).not.toHaveBeenCalled();
  });

  it("passe les events d'identité au contexte KYC, sans les interpréter", async () => {
    const event = {
      id: 'evt_1',
      type: 'identity.verification_session.verified',
      data: { object: { id: 'vs_1', metadata: { userId: '42' } } },
    };
    stripeService.constructWebhookEvent.mockReturnValue(event);

    const result = await controller.handleStripeWebhook('sig', req(event));

    expect(identityWebhook.handle).toHaveBeenCalledWith(event);
    expect(result).toEqual({
      received: true,
      type: event.type,
      eventId: 'evt_1',
    });
  });
});
