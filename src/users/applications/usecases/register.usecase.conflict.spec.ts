import { ConflictException } from '@nestjs/common';
import { RegisterUseCase } from './register.usecase';
import {
  asUniqueViolation,
  isEmailUniqueViolation,
} from 'src/common/persistence/unique-violation';

/**
 * ANO-01 — une violation de contrainte d'unicité pendant l'inscription
 * remontait en `500 Internal server error`, sans message exploitable ni pour
 * l'utilisateur ni pour l'exploitation.
 *
 * Cause racine constatée en QA : la séquence `user_emails_userId_seq`
 * désynchronisée par un clonage SQL de comptes — la clé primaire entrait en
 * collision, pas l'adresse e-mail.
 */
describe('unique-violation — détection', () => {
  const pgError = (over: Record<string, unknown> = {}) => ({
    code: '23505',
    constraint: 'PK_569342223a28f006d9bf897c7c9',
    detail: 'La clé ("userId")=(12) existe déjà.',
    ...over,
  });

  it('reconnaît une erreur pilote brute', () => {
    expect(asUniqueViolation(pgError())).toEqual({
      constraint: 'PK_569342223a28f006d9bf897c7c9',
      detail: 'La clé ("userId")=(12) existe déjà.',
    });
  });

  it('reconnaît une erreur TypeORM enveloppée (driverError)', () => {
    const wrapped = Object.assign(new Error('QueryFailedError'), {
      driverError: pgError(),
      code: '23505',
    });

    expect(asUniqueViolation(wrapped)?.constraint).toBe(
      'PK_569342223a28f006d9bf897c7c9',
    );
  });

  it.each([
    ['une erreur quelconque', new Error('boom')],
    ['un autre SQLSTATE', { code: '23503', constraint: 'FK_x' }],
    ['null', null],
    ['une chaîne', 'erreur'],
  ])('ignore %s', (_label, err) => {
    expect(asUniqueViolation(err)).toBeNull();
  });

  it('distingue une collision d\'e-mail d\'une collision de clé primaire', () => {
    expect(
      isEmailUniqueViolation({
        constraint: 'UQ_user_emails_email',
        detail: 'La clé (email)=(a@b.c) existe déjà.',
      }),
    ).toBe(true);

    expect(
      isEmailUniqueViolation({
        constraint: 'PK_569342223a28f006d9bf897c7c9',
        detail: 'La clé ("userId")=(12) existe déjà.',
      }),
    ).toBe(false);
  });
});

describe('RegisterUseCase — traduction des conflits de persistance', () => {
  const dto = {
    firstname: 'Qa',
    lastname: 'Persona',
    email: 'qa@beown.fr',
    password: 'QaKyc2026Test!',
  } as any;

  const makeUseCase = (saveImpl: () => Promise<any>) => {
    const userRepository: any = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(saveImpl),
      findById: jest.fn().mockResolvedValue(null),
    };
    const userFactory: any = {
      create: jest.fn().mockResolvedValue({ userId: 1 }),
    };
    const notificationEvents: any = { userRegistered: jest.fn() };
    const sendOtp: any = { send: jest.fn().mockResolvedValue(undefined) };

    const usecase = new RegisterUseCase(
      userFactory,
      userRepository,
      notificationEvents,
      sendOtp,
    );
    return { usecase, userRepository, sendOtp };
  };

  const duplicate = (constraint: string, detail: string) =>
    Object.assign(new Error('QueryFailedError: duplicate key'), {
      code: '23505',
      driverError: { code: '23505', constraint, detail },
      query: 'INSERT INTO "user_emails"("email","isVerified","verifiedDate","user_id") VALUES ($1,$2,$3,$4)',
    });

  it('séquence désynchronisée : 409 exploitable au lieu d\'un 500 brut', async () => {
    const { usecase } = makeUseCase(() =>
      Promise.reject(
        duplicate(
          'PK_569342223a28f006d9bf897c7c9',
          'La clé ("userId")=(12) existe déjà.',
        ),
      ),
    );

    const error = await usecase.execute(dto).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'REGISTRATION_CONFLICT',
      message:
        "Votre inscription n'a pas pu être enregistrée. Merci de réessayer dans quelques instants.",
    });
  });

  it('aucune fuite de SQL, de contrainte ni de valeur en conflit vers le client', async () => {
    const { usecase } = makeUseCase(() =>
      Promise.reject(
        duplicate(
          'PK_569342223a28f006d9bf897c7c9',
          'La clé ("userId")=(12) existe déjà.',
        ),
      ),
    );

    const error: any = await usecase.execute(dto).catch((e) => e);
    const body = JSON.stringify(error.getResponse());

    expect(body).not.toMatch(/INSERT INTO/i);
    expect(body).not.toMatch(/user_emails/);
    expect(body).not.toMatch(/PK_569342223a28f006d9bf897c7c9/);
    expect(body).not.toMatch(/existe déjà\./);
  });

  it('collision concurrente sur l\'e-mail : message dédié', async () => {
    const { usecase } = makeUseCase(() =>
      Promise.reject(
        duplicate('UQ_user_emails_email', 'La clé (email)=(qa@beown.fr) existe déjà.'),
      ),
    );

    const error: any = await usecase.execute(dto).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'EMAIL_ALREADY_USED' }),
    );
  });

  it('une erreur non liée à l\'unicité n\'est pas masquée en 409', async () => {
    const boom = new Error('connexion perdue');
    const { usecase } = makeUseCase(() => Promise.reject(boom));

    await expect(usecase.execute(dto)).rejects.toBe(boom);
  });

  it('chemin nominal inchangé : sauvegarde puis envoi du code', async () => {
    const { usecase, sendOtp } = makeUseCase(() =>
      Promise.resolve({ userId: 42 }),
    );

    await expect(usecase.execute(dto)).resolves.toEqual({ userId: 42 });
    expect(sendOtp.send).toHaveBeenCalled();
  });

  it('e-mail déjà pris détecté en amont : 409 sans tentative d\'écriture', async () => {
    const { usecase, userRepository } = makeUseCase(() =>
      Promise.resolve({ userId: 42 }),
    );
    userRepository.findByEmail.mockResolvedValue({ userId: 7 });

    await expect(usecase.execute(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
