import { Logger } from '@nestjs/common';
import { KycValideEventHandler } from './kyc-valide.event-handler';
import type { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import type { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycValideDomainEvent } from 'src/compliance/domain/events/kyc-valide.domain-event';

const EVENT = new KycValideDomainEvent('kyc-1', 42, 99);

function monter() {
  const push = jest.fn().mockResolvedValue(undefined);
  const kycValidatedByAdmin = jest.fn().mockResolvedValue(undefined);

  const handler = new KycValideEventHandler(
    { push } as unknown as NotificationService,
    { kycValidatedByAdmin } as unknown as NotificationEventService,
  );

  return { handler, push, kycValidatedByAdmin };
}

describe('KycValideEventHandler', () => {
  it('annonce la validation au titulaire', async () => {
    const { handler, push } = monter();

    await handler.handle(EVENT);

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: 42,
        type: NotificationType.KYC_VALIDE,
        titre: 'KYC validé',
      }),
    );
  });

  it("trace la décision au nom de l'administrateur qui l'a prise", async () => {
    const { handler, kycValidatedByAdmin } = monter();

    await handler.handle(EVENT);

    expect(kycValidatedByAdmin).toHaveBeenCalledWith(42, 99);
  });

  it("trace l'audit même si la notification du titulaire échoue", async () => {
    // Les deux réactions sont indépendantes : une panne du stockage de
    // notifications ne doit pas priver l'audit de sa trace.
    const { handler, push, kycValidatedByAdmin } = monter();
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    push.mockRejectedValue(new Error('base indisponible'));

    await expect(handler.handle(EVENT)).resolves.toBeUndefined();

    expect(kycValidatedByAdmin).toHaveBeenCalled();
    expect(erreur).toHaveBeenCalled();
    erreur.mockRestore();
  });
});
