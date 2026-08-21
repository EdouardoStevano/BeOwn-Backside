import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import type { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { UserRegisteredDomainEvent } from 'src/iam/domain/events/user-registered.domain-event';
import { buildUser } from 'src/iam/domain/aggregates/user.fixture';
import type { SendEmailVerificationUseCase } from '../usecases/email/send-email-verification.usecase';
import { UserRegisteredEventHandler } from './user-registered.event-handler';

const USER_ID = 42;
const event = new UserRegisteredDomainEvent(
  USER_ID,
  'user@example.com',
  'Jean',
);

const build = (user = buildUser({ userId: USER_ID })) => {
  const userRepository = {
    findById: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOneBySocialId: jest.fn(),
    findPreferences: jest.fn(),
    savePreferences: jest.fn(),
  };
  const notificationEvents = {
    userRegistered: jest.fn().mockResolvedValue(undefined),
  };
  const sendEmailVerificationUseCase = {
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const handler = new UserRegisteredEventHandler(
    userRepository as unknown as UserRepository,
    notificationEvents as unknown as NotificationEventService,
    sendEmailVerificationUseCase as unknown as SendEmailVerificationUseCase,
  );

  return {
    handler,
    userRepository,
    notificationEvents,
    sendEmailVerificationUseCase,
    user,
  };
};

describe('UserRegisteredEventHandler', () => {
  it('envoie le lien de vérification à l’adresse portée par l’événement', async () => {
    const { handler, sendEmailVerificationUseCase } = build();

    await handler.handle(event);

    // L'adresse vient du compte persisté au moment de l'inscription, pas d'une
    // relecture ni du DTO d'entrée.
    expect(sendEmailVerificationUseCase.execute).toHaveBeenCalledWith(
      'user@example.com',
    );
  });

  it('une panne du mailer ne fait rien remonter : l’inscription est acquise', async () => {
    const { handler, sendEmailVerificationUseCase } = build();
    sendEmailVerificationUseCase.execute.mockRejectedValue(
      new Error('mail down'),
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });

  it('notifie quand même les administrateurs si le mail échoue', async () => {
    const { handler, sendEmailVerificationUseCase, notificationEvents } =
      build();
    sendEmailVerificationUseCase.execute.mockRejectedValue(
      new Error('mail down'),
    );

    await handler.handle(event);

    expect(notificationEvents.userRegistered).toHaveBeenCalled();
  });

  it('envoie quand même le mail si la notification échoue', async () => {
    const { handler, sendEmailVerificationUseCase, notificationEvents } =
      build();
    notificationEvents.userRegistered.mockRejectedValue(new Error('bus down'));

    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(sendEmailVerificationUseCase.execute).toHaveBeenCalled();
  });

  it('relit le compte annoncé et notifie les administrateurs', async () => {
    const { handler, userRepository, notificationEvents, user } = build();

    await handler.handle(event);

    expect(userRepository.findById).toHaveBeenCalledWith(USER_ID);
    expect(notificationEvents.userRegistered).toHaveBeenCalledWith(user);
  });

  it('ne notifie rien si le compte a disparu entre l’émission et la réaction', async () => {
    const { handler, userRepository, notificationEvents } = build();
    userRepository.findById.mockResolvedValue(null);

    await handler.handle(event);

    expect(notificationEvents.userRegistered).not.toHaveBeenCalled();
  });

  it('avale ses pannes : une notification perdue n’annule pas une inscription', async () => {
    const { handler, notificationEvents } = build();
    notificationEvents.userRegistered.mockRejectedValue(
      new Error('bus de notifications indisponible'),
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
