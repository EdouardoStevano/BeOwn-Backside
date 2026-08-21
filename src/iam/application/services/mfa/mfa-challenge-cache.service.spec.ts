import type { Cache } from '@nestjs/cache-manager';
import { MfaMethodType } from 'src/iam/domain/enums/mfa-method.enum';
import {
  MFA_CHALLENGE_MAX_ATTEMPTS,
  MfaChallengePurpose,
  type MfaChallengeDraft,
} from 'src/iam/application/dto/mfa-challenge';

import { MFAChallengeCacheService } from './mfa-challenge-cache.service';

const USER_ID = 42;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const draft: MfaChallengeDraft = {
  userId: USER_ID,
  method: MfaMethodType.SMS,
  purpose: MfaChallengePurpose.SIGN_IN,
  sentTo: '+33*******78',
};

/**
 * Cache en mémoire, fidèle à la signature `set(key, value, ttl)` du port. Les
 * TTL sont relevés au passage : c'est sur eux que porte l'essentiel des
 * garanties du store, et ils ne se lisent pas dans les entrées.
 */
const makeCache = () => {
  const entries = new Map<string, unknown>();
  const ttls: number[] = [];

  return {
    entries,
    ttls,
    get: jest.fn((key: string) => Promise.resolve(entries.get(key))),
    set: jest.fn((key: string, value: unknown, ttl: number) => {
      entries.set(key, value);
      ttls.push(ttl);
      return Promise.resolve(value);
    }),
    del: jest.fn((key: string) => {
      entries.delete(key);
      return Promise.resolve(true);
    }),
  };
};

const build = () => {
  const cache = makeCache();
  const store = new MFAChallengeCacheService(cache as unknown as Cache);
  return { store, cache };
};

describe('MFAChallengeCacheService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('émet un challenge borné en essais et en durée', async () => {
    const { store, cache } = build();

    const challenge = await store.issue(draft);

    expect(challenge.id).toEqual(expect.any(String));
    expect(challenge.attemptsLeft).toBe(MFA_CHALLENGE_MAX_ATTEMPTS);
    expect(cache.ttls[0]).toBe(CHALLENGE_TTL_MS);
  });

  it('rend un identifiant opaque, qui ne dérive ni du compte ni du canal', async () => {
    const { store } = build();

    const first = await store.issue(draft);
    const second = await store.issue(draft);

    // Un UUID aléatoire : détenir l'identifiant ne renseigne pas sur le compte
    // visé, et deux challenges du même compte ne se ressemblent pas.
    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.id).not.toBe(second.id);
  });

  it('ne laisse pas fuiter l’échéance interne dans le modèle de domaine', async () => {
    const { store } = build();

    const challenge = await store.issue(draft);

    expect(challenge).not.toHaveProperty('expiresAt');
    await expect(store.find(challenge.id)).resolves.not.toHaveProperty(
      'expiresAt',
    );
  });

  it('rend `null` sur un challenge inconnu', async () => {
    const { store } = build();

    await expect(store.find('jamais-émis')).resolves.toBeNull();
  });

  it('décompte un essai manqué sans repartir sur un TTL neuf', async () => {
    const { store, cache } = build();
    const challenge = await store.issue(draft);

    // Une minute s'écoule avant la faute de frappe.
    jest.advanceTimersByTime(60_000);
    await store.registerFailedAttempt(challenge.id);

    const remaining = await store.find(challenge.id);
    expect(remaining?.attemptsLeft).toBe(MFA_CHALLENGE_MAX_ATTEMPTS - 1);
    // Enchaîner les erreurs ne doit pas prolonger la fenêtre de validité.
    expect(cache.ttls[1]).toBe(CHALLENGE_TTL_MS - 60_000);
  });

  it('détruit le challenge une fois les essais épuisés', async () => {
    const { store } = build();
    const challenge = await store.issue(draft);

    for (let i = 0; i < MFA_CHALLENGE_MAX_ATTEMPTS; i++) {
      await store.registerFailedAttempt(challenge.id);
    }

    await expect(store.find(challenge.id)).resolves.toBeNull();
  });

  it('refuse une entrée périmée même si le backend l’a conservée', async () => {
    const { store, cache } = build();
    const challenge = await store.issue(draft);

    jest.advanceTimersByTime(CHALLENGE_TTL_MS + 1);

    await expect(store.find(challenge.id)).resolves.toBeNull();
    // Et l'entrée est purgée au passage, plutôt que relue à chaque tentative.
    expect(cache.del).toHaveBeenCalled();
    expect(cache.entries.size).toBe(0);
  });

  it('retire définitivement le challenge une fois la preuve apportée', async () => {
    const { store, cache } = build();
    const challenge = await store.issue(draft);

    await store.discard(challenge.id);

    expect(cache.entries.size).toBe(0);
    await expect(store.find(challenge.id)).resolves.toBeNull();
  });

  it('ignore un essai manqué sur un challenge déjà consommé', async () => {
    const { store } = build();
    const challenge = await store.issue(draft);
    await store.discard(challenge.id);

    await expect(
      store.registerFailedAttempt(challenge.id),
    ).resolves.toBeUndefined();
  });
});
