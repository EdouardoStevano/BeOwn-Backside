import { RegisterUseCase } from './register.usecase';
import {
  EmailAlreadyRegisteredError,
  IamErrorKind,
  RegistrationConflictError,
} from 'src/iam/domains/errors';
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
 *
 * Depuis la refonte hexagonale IAM, le use case ne lève plus d'exception HTTP :
 * il lève une `IamError` que `IamErrorFilter` traduit (CONFLICT → 409).
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
  const input = {
    firstname: 'Qa',
    lastname: 'Persona',
    email: 'qa@beown.fr',
    password: 'QaKyc2026Test!',
    // Consentement CGU (lot 2) : requis en amont de toute persistance — ces
    // tests visent la traduction des conflits, pas le refus (couvert ailleurs).
    accepteCgu: true,
    cguVersion: '1.0',
  };

  const makeUseCase = (saveImpl: () => Promise<any>) => {
    const userRepository: any = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(saveImpl),
    };
    const userFactory: any = {
      create: jest.fn().mockResolvedValue({ userId: 1 }),
    };
    const eventBus: any = { publish: jest.fn() };

    return {
      usecase: new RegisterUseCase(userFactory, userRepository, eventBus),
      userRepository,
      eventBus,
    };
  };

  const duplicate = (constraint: string, detail: string) =>
    Object.assign(new Error('QueryFailedError: duplicate key'), {
      code: '23505',
      driverError: { code: '23505', constraint, detail },
      query:
        'INSERT INTO "user_emails"("email","isVerified","verifiedDate","user_id") VALUES ($1,$2,$3,$4)',
    });

  it('séquence désynchronisée : erreur CONFLICT exploitable au lieu d\'un 500 brut', async () => {
    const { usecase } = makeUseCase(() =>
      Promise.reject(
        duplicate(
          'PK_569342223a28f006d9bf897c7c9',
          'La clé ("userId")=(12) existe déjà.',
        ),
      ),
    );

    const error: any = await usecase.execute(input).catch((e) => e);

    expect(error).toBeInstanceOf(RegistrationConflictError);
    // CONFLICT est traduit en 409 par IamErrorFilter.
    expect(error.kind).toBe(IamErrorKind.CONFLICT);
    expect(error.code).toBe('REGISTRATION_CONFLICT');
    expect(error.message).toMatch(/réessayer dans quelques instants/);
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

    const error: any = await usecase.execute(input).catch((e) => e);
    // `IamErrorFilter` ne rend que message + code : c'est la surface exposée.
    const exposed = JSON.stringify({
      message: error.message,
      code: error.code,
      details: error.details,
    });

    expect(exposed).not.toMatch(/INSERT INTO/i);
    expect(exposed).not.toMatch(/user_emails/);
    expect(exposed).not.toMatch(/PK_569342223a28f006d9bf897c7c9/);
    expect(exposed).not.toMatch(/existe déjà\./);
  });

  it('collision concurrente sur l\'e-mail : même erreur que la vérification préalable', async () => {
    const { usecase } = makeUseCase(() =>
      Promise.reject(
        duplicate('UQ_user_emails_email', 'La clé (email)=(qa@beown.fr) existe déjà.'),
      ),
    );

    const error: any = await usecase.execute(input).catch((e) => e);

    expect(error).toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(error.kind).toBe(IamErrorKind.CONFLICT);
  });

  it('une erreur non liée à l\'unicité n\'est pas masquée en conflit', async () => {
    const boom = new Error('connexion perdue');
    const { usecase } = makeUseCase(() => Promise.reject(boom));

    await expect(usecase.execute(input)).rejects.toBe(boom);
  });

  it('aucun événement d\'inscription publié quand la sauvegarde échoue', async () => {
    const { usecase, eventBus } = makeUseCase(() =>
      Promise.reject(
        duplicate('PK_569342223a28f006d9bf897c7c9', 'La clé ("userId")=(12) existe déjà.'),
      ),
    );

    await usecase.execute(input).catch(() => undefined);

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('chemin nominal inchangé : sauvegarde puis publication de l\'événement', async () => {
    const { usecase, eventBus } = makeUseCase(() =>
      Promise.resolve({ userId: 42, email: 'qa@beown.fr', firstname: 'Qa' }),
    );

    await expect(usecase.execute(input)).resolves.toEqual(
      expect.objectContaining({ userId: 42 }),
    );
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('e-mail déjà pris détecté en amont : aucune tentative d\'écriture', async () => {
    const { usecase, userRepository } = makeUseCase(() =>
      Promise.resolve({ userId: 42 }),
    );
    userRepository.findByEmail.mockResolvedValue({ userId: 7 });

    await expect(usecase.execute(input)).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
