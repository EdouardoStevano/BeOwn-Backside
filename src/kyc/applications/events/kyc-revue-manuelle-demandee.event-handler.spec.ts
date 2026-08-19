import { Logger } from '@nestjs/common';
import { KycRevueManuelleDemandeeEventHandler } from './kyc-revue-manuelle-demandee.event-handler';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import type { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { KycRevueManuelleDemandeeDomainEvent } from 'src/kyc/domains/events/kyc-revue-manuelle-demandee.domain-event';

const EVENT = new KycRevueManuelleDemandeeDomainEvent(
  'kyc-1',
  42,
  'Dépôt manuel de documents — revue requise',
);

function monter() {
  const pushToAdmins = jest.fn().mockResolvedValue([]);
  const handler = new KycRevueManuelleDemandeeEventHandler({
    pushToAdmins,
  } as unknown as NotificationService);

  return { handler, pushToAdmins };
}

describe('KycRevueManuelleDemandeeEventHandler', () => {
  it('alerte la compliance et les super-admins', async () => {
    const { handler, pushToAdmins } = monter();

    await handler.handle(EVENT);

    expect(pushToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.KYC_REVUE_MANUELLE,
        roles: [UserRole.COMPLIANCE, UserRole.SUPER_ADMIN],
        metadata: { userId: 42, kycId: 'kyc-1' },
      }),
    );
  });

  it('trace un échec de notification au lieu de le laisser filer', async () => {
    // Le contrôleur faisait `.catch(() => {})` : un dossier pouvait attendre
    // indéfiniment une compliance jamais prévenue, sans la moindre trace.
    const { handler, pushToAdmins } = monter();
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    pushToAdmins.mockRejectedValue(new Error('base indisponible'));

    await expect(handler.handle(EVENT)).resolves.toBeUndefined();
    expect(erreur).toHaveBeenCalled();

    erreur.mockRestore();
  });
});
