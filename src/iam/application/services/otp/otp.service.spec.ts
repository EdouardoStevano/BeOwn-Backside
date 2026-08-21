import { OtpService } from './otp.service';
import type {
  OtpRecord,
  OtpRecordStore,
} from 'src/iam/application/ports/otp-record-store.port';
import { TooManyOtpAttemptsError } from 'src/iam/domain/errors';

/** Magasin en mémoire, fidèle au contrat du port — il range, il ne décide pas. */
const makeStore = () => {
  const entries = new Map<string, OtpRecord>();
  const ttls: number[] = [];

  return {
    entries,
    ttls,
    save: jest.fn((key: string, record: OtpRecord, ttlMs: number) => {
      ttls.push(ttlMs);
      entries.set(key, record);
      return Promise.resolve();
    }),
    find: jest.fn((key: string) => Promise.resolve(entries.get(key) ?? null)),
    delete: jest.fn((key: string) => {
      entries.delete(key);
      return Promise.resolve();
    }),
  };
};

const build = () => {
  const store = makeStore();
  const service = new OtpService(store as unknown as OtpRecordStore);
  return { service, store };
};

describe('OtpService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('tire un code à six chiffres et le range avec une échéance', async () => {
    const { service, store } = build();

    const otp = await service.generateOtp('otp:email:a@b.c');

    expect(otp).toMatch(/^\d{6}$/);
    // Le port reçoit une durée : elle ne se décide plus dans le magasin.
    expect(store.ttls[0]).toBeGreaterThan(0);
    expect(store.entries.get('otp:email:a@b.c')).toMatchObject({
      otp,
      attempts: 0,
      expiresAt: Date.now() + store.ttls[0],
    });
  });

  it('consomme l’entrée au premier succès : un OTP ne sert qu’une fois', async () => {
    const { service, store } = build();
    const otp = await service.generateOtp('k');

    await expect(service.verifyOtp('k', otp)).resolves.toBe(true);

    expect(store.entries.has('k')).toBe(false);
    await expect(service.verifyOtp('k', otp)).resolves.toBe(false);
  });

  it('décompte un essai sur code faux, sans prolonger la fenêtre', async () => {
    const { service, store } = build();
    await service.generateOtp('k');
    const initialExpiry = store.entries.get('k')!.expiresAt;

    // Une fraction du TTL observé, pas une durée en dur : `OTP_TTL` se règle
    // par environnement, le test ne doit pas casser quand il change.
    jest.advanceTimersByTime(Math.floor(store.ttls[0] / 3));
    await expect(service.verifyOtp('k', '000000')).resolves.toBe(false);

    expect(store.entries.get('k')?.attempts).toBe(1);
    // L'échéance ne bouge pas : enchaîner les erreurs prolongerait sinon la
    // validité aussi longtemps qu'on veut.
    expect(store.entries.get('k')?.expiresAt).toBe(initialExpiry);
    expect(store.ttls[store.ttls.length - 1]).toBeLessThan(store.ttls[0]);
  });

  it('détruit l’entrée et refuse au-delà du plafond d’essais', async () => {
    const { service, store } = build();
    await service.generateOtp('k');

    // MAX_ATTEMPTS vaut 5 par défaut : le sixième appel bute sur le plafond.
    for (let i = 0; i < 5; i++) {
      await service.verifyOtp('k', '000000');
    }

    await expect(service.verifyOtp('k', '000000')).rejects.toBeInstanceOf(
      TooManyOtpAttemptsError,
    );
    expect(store.entries.has('k')).toBe(false);
  });

  it('tient l’échéance pour son propre compte, sans croire le magasin', async () => {
    const { service, store } = build();
    const otp = await service.generateOtp('k');

    // Le magasin rend encore l'entrée (backend sans éviction fiable) : c'est
    // la date portée par le record qui tranche.
    jest.advanceTimersByTime(store.ttls[0] + 1_000);

    expect(store.entries.has('k')).toBe(true);
    await expect(service.hasActiveOtp('k')).resolves.toBe(false);
    await expect(service.verifyOtp('k', otp)).resolves.toBe(false);
    // La lecture purge au passage l'entrée périmée.
    expect(store.entries.has('k')).toBe(false);
  });

  it('signale un code en attente, et l’oublie sur invalidation', async () => {
    const { service } = build();
    await service.generateOtp('k');

    await expect(service.hasActiveOtp('k')).resolves.toBe(true);
    await service.invalidate('k');
    await expect(service.hasActiveOtp('k')).resolves.toBe(false);
  });

  it('écrase le code précédent sur la même clé', async () => {
    const { service, store } = build();
    const first = await service.generateOtp('k');
    const second = await service.generateOtp('k');

    // Deux codes vivants pour une même destination doubleraient les essais.
    expect(store.entries.size).toBe(1);
    expect(store.entries.get('k')?.otp).toBe(second);
    await expect(service.verifyOtp('k', first)).resolves.toBe(false);
  });
});
