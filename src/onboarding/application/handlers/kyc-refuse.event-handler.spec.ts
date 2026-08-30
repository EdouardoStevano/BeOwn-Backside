import { KycRefuseEventHandler } from './kyc-refuse.event-handler';
import type { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import type { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycRefuseDomainEvent } from 'src/onboarding/domain/events/kyc-refuse.domain-event';

function monter() {
  const push = jest.fn().mockResolvedValue(undefined);
  const kycRejectedByAdmin = jest.fn().mockResolvedValue(undefined);

  const handler = new KycRefuseEventHandler(
    { push } as unknown as NotificationService,
    { kycRejectedByAdmin } as unknown as NotificationEventService,
  );

  return { handler, push, kycRejectedByAdmin };
}

describe('KycRefuseEventHandler', () => {
  it('dit au titulaire ce qui lui est opposé', async () => {
    const { handler, push } = monter();

    await handler.handle(
      new KycRefuseDomainEvent('kyc-1', 42, 'Document illisible', 99),
    );

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.KYC_REJETE,
        message: 'Votre KYC a été refusé : Document illisible',
        metadata: { motifRefus: 'Document illisible' },
      }),
    );
  });

  it("retombe sur un message générique quand le refus n'est pas motivé", async () => {
    const { handler, push, kycRejectedByAdmin } = monter();

    await handler.handle(new KycRefuseDomainEvent('kyc-1', 42, null, 99));

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Votre KYC a été refusé. Merci de mettre à jour votre dossier.',
      }),
    );
    // L'audit veut une chaîne, pas un trou.
    expect(kycRejectedByAdmin).toHaveBeenCalledWith(42, '—', 99);
  });

  it("trace la décision au nom de l'administrateur qui l'a prise", async () => {
    const { handler, kycRejectedByAdmin } = monter();

    await handler.handle(
      new KycRefuseDomainEvent('kyc-1', 42, 'Document illisible', 99),
    );

    expect(kycRejectedByAdmin).toHaveBeenCalledWith(
      42,
      'Document illisible',
      99,
    );
  });
});
