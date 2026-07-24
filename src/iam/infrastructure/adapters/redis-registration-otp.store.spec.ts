import { RedisRegistrationOtpStore } from './redis-registration-otp.store';
import { RegistrationOtpVerdict } from 'src/iam/domain/ports/registration-otp.store';

const TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;

const makeStore = () => {
  const cached = new Map<string, unknown>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(cached.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      cached.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      cached.delete(key);
      return Promise.resolve();
    }),
  };
  const hashingService = {
    hash: jest.fn((data: string) => Promise.resolve(`hashed:${data}`)),
    compare: jest.fn((data: string, encrypted: string) =>
      Promise.resolve(encrypted === `hashed:${data}`),
    ),
  };

  const store = new RedisRegistrationOtpStore(
    cache as never,
    hashingService as never,
    {
      ttlSeconds: TTL_SECONDS,
      maxAttempts: MAX_ATTEMPTS,
      resendCooldownSeconds: 60,
    },
  );

  return { store, cache, hashingService };
};

describe('RedisRegistrationOtpStore', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('émet un code à 6 chiffres et ne stocke que son empreinte', async () => {
    const { store, cache, hashingService } = makeStore();

    const code = await store.issue('user@example.com');

    expect(code).toMatch(/^\d{6}$/);
    expect(hashingService.hash).toHaveBeenCalledWith(code);
    const [key, record] = cache.set.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(key).toBe('registration-otp-user@example.com');
    expect(record.codeHash).toBe(`hashed:${code}`);
    expect(record).not.toHaveProperty('code');
  });

  it('valide un code correct une seule fois', async () => {
    const { store } = makeStore();
    const code = await store.issue('user@example.com');

    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.OK,
    );
    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.EXPIRED,
    );
  });

  it('refuse un mauvais code sans consommer le bon', async () => {
    const { store } = makeStore();
    const code = await store.issue('user@example.com');

    await expect(store.verify('user@example.com', 'wrong1')).resolves.toBe(
      RegistrationOtpVerdict.INVALID,
    );
    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.OK,
    );
  });

  it(`invalide le code après ${MAX_ATTEMPTS} tentatives ratées`, async () => {
    const { store } = makeStore();
    const code = await store.issue('user@example.com');

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      await expect(store.verify('user@example.com', 'wrong1')).resolves.toBe(
        RegistrationOtpVerdict.INVALID,
      );
    }
    await expect(store.verify('user@example.com', 'wrong1')).resolves.toBe(
      RegistrationOtpVerdict.TOO_MANY_ATTEMPTS,
    );
    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.EXPIRED,
    );
  });

  it('considère le code expiré une fois son TTL dépassé', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { store } = makeStore();
    const code = await store.issue('user@example.com');

    jest.spyOn(Date, 'now').mockReturnValue(now + TTL_SECONDS * 1000 + 1);

    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.EXPIRED,
    );
  });

  it('une tentative ratée ne prolonge pas la validité du code', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { store } = makeStore();
    const code = await store.issue('user@example.com');

    // Presque expiré, puis un essai raté : le TTL logique ne repart pas de zéro.
    jest.spyOn(Date, 'now').mockReturnValue(now + TTL_SECONDS * 1000 - 1000);
    await expect(store.verify('user@example.com', 'wrong1')).resolves.toBe(
      RegistrationOtpVerdict.INVALID,
    );

    jest.spyOn(Date, 'now').mockReturnValue(now + TTL_SECONDS * 1000 + 1);
    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.EXPIRED,
    );
  });

  it('invalide le code et le délai anti-renvoi (retry immédiat après échec de livraison)', async () => {
    const { store } = makeStore();
    await store.issue('user@example.com');
    expect(await store.isResendThrottled('user@example.com')).toBe(true);

    await store.invalidate('user@example.com');

    expect(await store.isResendThrottled('user@example.com')).toBe(false);
    await expect(store.verify('user@example.com', '000000')).resolves.toBe(
      RegistrationOtpVerdict.EXPIRED,
    );
  });

  it('arme le délai anti-renvoi dès la génération', async () => {
    const { store } = makeStore();
    expect(await store.isResendThrottled('user@example.com')).toBe(false);

    await store.issue('user@example.com');

    expect(await store.isResendThrottled('user@example.com')).toBe(true);
  });

  it('normalise casse et espaces dans la clé', async () => {
    const { store } = makeStore();
    const code = await store.issue('  User@Example.com  ');

    await expect(store.verify('user@example.com', code)).resolves.toBe(
      RegistrationOtpVerdict.OK,
    );
  });
});
