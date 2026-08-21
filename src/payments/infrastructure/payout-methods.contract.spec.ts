import {
  PayoutMethodError,
  PayoutMethodView,
  PayoutMethodsReader,
  PayoutMethodsWriter,
} from '../applications/ports/payout-methods.port';
import { InMemoryPayoutMethodsAdapter } from './in-memory-payout-methods.adapter';
import { StripePayoutMethodsService } from './stripe-payout-methods.service';

/**
 * LSP — suite de tests de CONTRAT exécutée sur les DEUX implémentations des
 * ports « destinations de retrait » : l'adaptateur Stripe et l'adaptateur en
 * mémoire. Si l'une dévie du contrat, le test échoue : la substituabilité est
 * vérifiée, pas déclarée.
 *
 * Les objets renvoyés par le faux client Stripe reprennent EXACTEMENT la forme
 * observée en mode test lors de la sonde `scripts/probe-instant-payout.ts`
 * (`available_payout_methods: ["standard","instant"]`, `default_for_currency`,
 * erreur `resource_missing`, refus de suppression de la destination par défaut).
 */

const ACCOUNT = 'acct_probe';

interface Harness {
  reader: PayoutMethodsReader;
  writer: PayoutMethodsWriter;
  /** Enregistre une destination préexistante sur le compte. */
  seed(method: PayoutMethodView): void;
  setBalance(available: number, instantAvailable: number): void;
  /** Fait échouer le prochain `attachCard` comme Stripe le ferait. */
  failNextAttach(): void;
}

const view = (over: Partial<PayoutMethodView> & { id: string }): PayoutMethodView => ({
  type: 'card',
  brand: 'visa',
  last4: '4242',
  expMonth: 12,
  expYear: 2030,
  isDefault: false,
  instantEligible: true,
  currency: 'EUR',
  country: 'FR',
  ...over,
});

/** Erreur Stripe minimale (mêmes champs que ceux lus par l'adaptateur). */
const stripeError = (message: string, code?: string): any => {
  const err: any = new Error(message);
  if (code) err.code = code;
  return err;
};

/**
 * Faux client Stripe : un magasin d'external accounts par compte connecté,
 * reproduisant les règles constatées en sonde.
 */
const makeFakeStripe = () => {
  const store = new Map<string, any[]>();
  let failAttach = false;
  let sequence = 0;

  const listOf = (accountId: string): any[] => store.get(accountId) ?? [];

  const client: any = {
    accounts: {
      listExternalAccounts: async (accountId: string) => ({
        data: listOf(accountId),
      }),
      retrieveExternalAccount: async (accountId: string, id: string) => {
        const found = listOf(accountId).find((e) => e.id === id);
        if (!found) {
          throw stripeError(`No such external account: '${id}'`, 'resource_missing');
        }
        return found;
      },
      createExternalAccount: async (accountId: string, params: any) => {
        if (failAttach) {
          failAttach = false;
          throw stripeError(
            'Instant payouts are not available for debit cards issued by a bank in the United States.',
            'instant_payouts_unsupported',
          );
        }
        sequence += 1;
        const existing = listOf(accountId);
        const created = {
          id: `card_fake_${sequence}`,
          object: 'card',
          brand: 'visa',
          funding: 'debit',
          last4: String(params.external_account).slice(-4),
          exp_month: 12,
          exp_year: 2030,
          currency: 'eur',
          country: 'FR',
          default_for_currency: existing.length === 0,
          available_payout_methods: ['standard', 'instant'],
        };
        store.set(accountId, [...existing, created]);
        return created;
      },
      updateExternalAccount: async (accountId: string, id: string, params: any) => {
        const existing = listOf(accountId);
        if (!existing.some((e) => e.id === id)) {
          throw stripeError(`No such external account: '${id}'`, 'resource_missing');
        }
        const updated = existing.map((e) => ({
          ...e,
          default_for_currency: params.default_for_currency
            ? e.id === id
            : e.default_for_currency,
        }));
        store.set(accountId, updated);
        return updated.find((e) => e.id === id);
      },
      deleteExternalAccount: async (accountId: string, id: string) => {
        const existing = listOf(accountId);
        const target = existing.find((e) => e.id === id);
        if (!target) {
          throw stripeError(`No such external account: '${id}'`, 'resource_missing');
        }
        if (target.default_for_currency && existing.length > 1) {
          // Message réel renvoyé par Stripe (relevé en sonde).
          throw stripeError(
            'You cannot delete the default external account for your default currency. ' +
              'Please make another external account the default using the `default_for_currency` param, and then delete this one.',
          );
        }
        store.set(accountId, existing.filter((e) => e.id !== id));
        return { id, deleted: true };
      },
    },
    balance: {
      retrieve: async (_params: any, _options: any) => balance,
    },
  };

  let balance: any = {
    available: [{ amount: 0, currency: 'eur' }],
    instant_available: [{ amount: 0, currency: 'eur' }],
  };

  return {
    client,
    seedRaw: (accountId: string, external: any) =>
      store.set(accountId, [...listOf(accountId), external]),
    setBalanceMinor: (available: number, instant: number) => {
      balance = {
        available: [{ amount: available, currency: 'eur' }],
        instant_available: [{ amount: instant, currency: 'eur' }],
      };
    },
    failNextAttach: () => {
      failAttach = true;
    },
  };
};

const makeInMemoryHarness = (): Harness => {
  const adapter = new InMemoryPayoutMethodsAdapter();
  return {
    reader: adapter,
    writer: adapter,
    seed: (method) => adapter.seed(ACCOUNT, method),
    setBalance: (available, instantAvailable) =>
      adapter.setBalance(ACCOUNT, { available, instantAvailable, currency: 'EUR' }),
    failNextAttach: () => adapter.rejectNextAttach('Cette carte a été refusée.'),
  };
};

const makeStripeHarness = (): Harness => {
  const fake = makeFakeStripe();
  const adapter = new StripePayoutMethodsService({ client: fake.client } as any);
  return {
    reader: adapter,
    writer: adapter,
    seed: (method) =>
      fake.seedRaw(ACCOUNT, {
        id: method.id,
        object: method.type === 'card' ? 'card' : 'bank_account',
        brand: method.type === 'card' ? method.brand : undefined,
        bank_name: method.type === 'bank_account' ? method.brand : undefined,
        last4: method.last4,
        exp_month: method.expMonth ?? undefined,
        exp_year: method.expYear ?? undefined,
        currency: method.currency.toLowerCase(),
        country: method.country,
        default_for_currency: method.isDefault,
        available_payout_methods: method.instantEligible
          ? ['standard', 'instant']
          : ['standard'],
      }),
    setBalance: (available, instantAvailable) =>
      fake.setBalanceMinor(
        Math.round(available * 100),
        Math.round(instantAvailable * 100),
      ),
    failNextAttach: fake.failNextAttach,
  };
};

describe.each([
  ['in-memory', makeInMemoryHarness],
  ['stripe', makeStripeHarness],
])('PayoutMethods — contrat des ports (%s)', (_name, makeHarness) => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('list : la destination par défaut est renvoyée en tête', async () => {
    h.seed(view({ id: 'card_a', isDefault: false }));
    h.seed(view({ id: 'card_b', isDefault: true }));

    const methods = await h.reader.list(ACCOUNT);

    expect(methods.map((m) => m.id)).toEqual(['card_b', 'card_a']);
    expect(methods[0].isDefault).toBe(true);
  });

  it('list : expose instantEligible et masque tout sauf last4', async () => {
    h.seed(view({ id: 'card_a', instantEligible: true, last4: '5556' }));
    h.seed(view({ id: 'card_b', instantEligible: false }));

    const methods = await h.reader.list(ACCOUNT);
    const a = methods.find((m) => m.id === 'card_a')!;
    const b = methods.find((m) => m.id === 'card_b')!;

    expect(a.instantEligible).toBe(true);
    expect(b.instantEligible).toBe(false);
    expect(a.last4).toBe('5556');
    expect(a.currency).toBe('EUR');
    // Aucune donnée porteur complète ne doit apparaître dans la vue.
    expect(Object.keys(a)).not.toContain('number');
    expect(Object.keys(a)).not.toContain('cvc');
  });

  it('find : renvoie null pour une destination absente du compte (anti-IDOR)', async () => {
    h.seed(view({ id: 'card_a' }));

    await expect(h.reader.find(ACCOUNT, 'card_dautrui')).resolves.toBeNull();
  });

  it('find : renvoie la destination du compte', async () => {
    h.seed(view({ id: 'card_a', instantEligible: true }));

    const found = await h.reader.find(ACCOUNT, 'card_a');

    expect(found).toEqual(expect.objectContaining({ id: 'card_a', instantEligible: true }));
  });

  it('getInstantBalance : montants en euros, pas en centimes', async () => {
    h.setBalance(120.5, 99.25);

    await expect(h.reader.getInstantBalance(ACCOUNT)).resolves.toEqual({
      available: 120.5,
      instantAvailable: 99.25,
      currency: 'EUR',
    });
  });

  it('attachCard : la première destination devient la destination par défaut', async () => {
    const created = await h.writer.attachCard(ACCOUNT, 'tok_visa_debit');

    expect(created.isDefault).toBe(true);
    expect(created.type).toBe('card');
    await expect(h.reader.find(ACCOUNT, created.id)).resolves.not.toBeNull();
  });

  it('attachCard : un refus Stripe devient PayoutMethodError CARD_REJECTED', async () => {
    h.failNextAttach();

    const error = await h.writer
      .attachCard(ACCOUNT, 'tok_visa_debit')
      .catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('CARD_REJECTED');
    // Message utilisateur en français, sans le texte technique de Stripe.
    expect(error.message).not.toMatch(/Instant payouts are not available/);
  });

  it('setDefault : bascule le drapeau et le retire à l\'ancienne destination', async () => {
    h.seed(view({ id: 'card_a', isDefault: true }));
    h.seed(view({ id: 'card_b', isDefault: false }));

    const updated = await h.writer.setDefault(ACCOUNT, 'card_b');

    expect(updated.isDefault).toBe(true);
    const methods = await h.reader.list(ACCOUNT);
    expect(methods.find((m) => m.id === 'card_a')!.isDefault).toBe(false);
  });

  it('setDefault : destination inconnue → NO_PAYOUT_METHOD', async () => {
    const error = await h.writer.setDefault(ACCOUNT, 'card_inconnue').catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('NO_PAYOUT_METHOD');
  });

  it('detach : supprime une destination non par défaut', async () => {
    h.seed(view({ id: 'card_a', isDefault: true }));
    h.seed(view({ id: 'card_b', isDefault: false }));

    await h.writer.detach(ACCOUNT, 'card_b');

    await expect(h.reader.find(ACCOUNT, 'card_b')).resolves.toBeNull();
  });

  it('detach : destination inconnue → NO_PAYOUT_METHOD', async () => {
    const error = await h.writer.detach(ACCOUNT, 'card_inconnue').catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('NO_PAYOUT_METHOD');
  });

  it('detach : refus de supprimer la destination par défaut → CANNOT_DELETE_DEFAULT', async () => {
    h.seed(view({ id: 'card_a', isDefault: true }));
    h.seed(view({ id: 'card_b', isDefault: false }));

    const error = await h.writer.detach(ACCOUNT, 'card_a').catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('CANNOT_DELETE_DEFAULT');
  });
});

describe('StripePayoutMethodsService — mapping spécifique Stripe', () => {
  it('mappe un IBAN (bank_account) sans exp et avec le nom de banque en brand', async () => {
    const fake = makeFakeStripe();
    // Forme exacte relevée en sonde pour un IBAN FR/EUR.
    fake.seedRaw('acct_probe', {
      id: 'ba_1U6cBBJ8aARfZNHrEs7JqZmt',
      object: 'bank_account',
      bank_name: 'STRIPE TEST BANK',
      last4: '2606',
      currency: 'eur',
      country: 'FR',
      default_for_currency: true,
      available_payout_methods: ['standard', 'instant'],
    });
    const adapter = new StripePayoutMethodsService({ client: fake.client } as any);

    const [method] = await adapter.list('acct_probe');

    expect(method).toEqual({
      id: 'ba_1U6cBBJ8aARfZNHrEs7JqZmt',
      type: 'bank_account',
      brand: 'STRIPE TEST BANK',
      last4: '2606',
      expMonth: null,
      expYear: null,
      isDefault: true,
      instantEligible: true,
      currency: 'EUR',
      country: 'FR',
    });
  });

  it('instantEligible=false quand available_payout_methods ne contient pas instant', async () => {
    const fake = makeFakeStripe();
    fake.seedRaw('acct_probe', {
      id: 'ba_std',
      object: 'bank_account',
      bank_name: 'BANQUE X',
      last4: '0001',
      currency: 'eur',
      country: 'FR',
      default_for_currency: true,
      available_payout_methods: ['standard'],
    });
    const adapter = new StripePayoutMethodsService({ client: fake.client } as any);

    const [method] = await adapter.list('acct_probe');

    expect(method.instantEligible).toBe(false);
  });

  it('getInstantBalance : ignore les devises autres que EUR', async () => {
    const fake = makeFakeStripe();
    const adapter = new StripePayoutMethodsService({ client: fake.client } as any);
    fake.setBalanceMinor(0, 0);
    // Balance multi-devises : seule la poche EUR doit être comptée.
    (fake.client.balance as any).retrieve = async () => ({
      available: [
        { amount: 5000, currency: 'eur' },
        { amount: 999_999, currency: 'usd' },
      ],
      instant_available: [{ amount: 2500, currency: 'eur' }],
    });

    await expect(adapter.getInstantBalance('acct_probe')).resolves.toEqual({
      available: 50,
      instantAvailable: 25,
      currency: 'EUR',
    });
  });
});
