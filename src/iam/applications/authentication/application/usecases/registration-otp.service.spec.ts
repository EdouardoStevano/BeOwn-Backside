import {
  RegistrationOtpService,
  RegistrationOtpVerifyResult,
  REGISTRATION_OTP_MAX_ATTEMPTS,
  REGISTRATION_OTP_TTL_SECONDS,
} from './registration-otp.service';

const makeService = () => {
  const store = new Map<string, unknown>();
  const cacheManager = {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  const hashingService = {
    hash: jest.fn(async (data: string) => `hashed:${data}`),
    compare: jest.fn(async (data: string, encrypted: string) => encrypted === `hashed:${data}`),
  };

  const service = new RegistrationOtpService(
    cacheManager as any,
    hashingService as any,
  );

  return { service, cacheManager, hashingService, store };
};

describe('RegistrationOtpService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('génère un code à 6 chiffres et stocke son hash (jamais le code en clair)', async () => {
    const { service, cacheManager, hashingService } = makeService();

    const code = await service.generate('user@example.com');

    expect(code).toMatch(/^\d{6}$/);
    expect(hashingService.hash).toHaveBeenCalledWith(code);
    const [key, record] = cacheManager.set.mock.calls[0] as [
      string,
      { codeHash: string },
    ];
    expect(key).toBe('registration-otp-user@example.com');
    expect(record.codeHash).toBe(`hashed:${code}`);
    expect(record).not.toHaveProperty('code');
  });

  it('valide un code correct une seule fois (single-use)', async () => {
    const { service } = makeService();
    const code = await service.generate('user@example.com');

    await expect(service.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerifyResult.OK,
    );
    // Rejoué : le code a été supprimé après le premier succès.
    await expect(service.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerifyResult.EXPIRED,
    );
  });

  it('refuse un mauvais code (INVALID) sans le consommer', async () => {
    const { service } = makeService();
    const code = await service.generate('user@example.com');

    await expect(service.verify('user@example.com', 'wrong1')).resolves.toBe(
      RegistrationOtpVerifyResult.INVALID,
    );
    // Le bon code reste utilisable après un essai raté.
    await expect(service.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerifyResult.OK,
    );
  });

  it(`invalide le code après ${REGISTRATION_OTP_MAX_ATTEMPTS} tentatives ratées`, async () => {
    const { service } = makeService();
    const code = await service.generate('user@example.com');

    for (let i = 0; i < REGISTRATION_OTP_MAX_ATTEMPTS - 1; i++) {
      await expect(service.verify('user@example.com', 'wrong1')).resolves.toBe(
        RegistrationOtpVerifyResult.INVALID,
      );
    }
    // La tentative qui atteint la limite renvoie TOO_MANY_ATTEMPTS...
    await expect(service.verify('user@example.com', 'wrong1')).resolves.toBe(
      RegistrationOtpVerifyResult.TOO_MANY_ATTEMPTS,
    );
    // ... et même le bon code ne fonctionne plus ensuite (invalidé).
    await expect(service.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerifyResult.EXPIRED,
    );
  });

  it('considère le code expiré une fois son TTL dépassé', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { service } = makeService();
    const code = await service.generate('user@example.com');

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(now + REGISTRATION_OTP_TTL_SECONDS * 1000 + 1);

    await expect(service.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerifyResult.EXPIRED,
    );
  });

  it('invalide le code et le cooldown de renvoi (retry immédiat après échec de livraison)', async () => {
    const { service } = makeService();
    await service.generate('user@example.com');
    expect(await service.isResendThrottled('user@example.com')).toBe(true);

    await service.invalidate('user@example.com');

    expect(await service.isResendThrottled('user@example.com')).toBe(false);
    await expect(
      service.verify('user@example.com', '000000'),
    ).resolves.toBe(RegistrationOtpVerifyResult.EXPIRED);
  });

  it('active le cooldown de renvoi (1/min) juste après génération', async () => {
    const { service } = makeService();
    expect(await service.isResendThrottled('user@example.com')).toBe(false);

    await service.generate('user@example.com');

    expect(await service.isResendThrottled('user@example.com')).toBe(true);
  });

  it('normalise (casse/espaces) la clé associée à un identifiant', async () => {
    const { service } = makeService();
    const code = await service.generate('  User@Example.com  ');

    await expect(
      service.verify('user@example.com', code),
    ).resolves.toBe(RegistrationOtpVerifyResult.OK);
  });
});
