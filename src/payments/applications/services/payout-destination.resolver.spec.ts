import { PayoutDestinationResolver } from './payout-destination.resolver';
import { InMemoryPayoutMethodsAdapter } from '../../infrastructure/in-memory-payout-methods.adapter';
import { PayoutMethodError } from '../ports/payout-methods.port';
import {
  INSTANT_PAYOUT_MAX_EUR,
  INSTANT_PAYOUT_MIN_EUR,
  isInstantPayoutAmountAllowed,
} from '../../domains/instant-payout-limits';

/**
 * Validation de la destination de retrait AVANT tout débit du wallet (Lot 4a).
 *
 * Ces tests s'exécutent sans base de données ni réseau : le résolveur ne dépend
 * que du port `PayoutMethodsReader`, ici l'adaptateur en mémoire.
 */
describe('PayoutDestinationResolver', () => {
  const ACCOUNT = 'acct_1';
  let adapter: InMemoryPayoutMethodsAdapter;
  let resolver: PayoutDestinationResolver;

  const seedCard = (id: string, over: Partial<{ isDefault: boolean; instantEligible: boolean }> = {}) =>
    adapter.seed(ACCOUNT, {
      id,
      type: 'card',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      isDefault: over.isDefault ?? false,
      instantEligible: over.instantEligible ?? true,
      currency: 'EUR',
      country: 'FR',
    });

  const resolve = (input: Partial<Parameters<PayoutDestinationResolver['resolve']>[0]> = {}) =>
    resolver.resolve({
      connectedAccountId: ACCOUNT,
      amount: 100,
      ...input,
    });

  beforeEach(() => {
    adapter = new InMemoryPayoutMethodsAdapter();
    resolver = new PayoutDestinationResolver(adapter);
  });

  // ─── Rétrocompatibilité ────────────────────────────────────────────────────

  it('sans payoutMethodId ni method : parcours historique, aucune lecture Stripe', async () => {
    const find = jest.spyOn(adapter, 'find');
    const list = jest.spyOn(adapter, 'list');

    const resolved = await resolve();

    expect(resolved).toEqual({ method: 'standard', explicit: false });
    // Aucun appel au fournisseur : le chemin existant n'est pas ralenti.
    expect(find).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('sans method, un montant hors bornes instantanées reste accepté (retrait standard)', async () => {
    // Le plafond de 9 999 € ne concerne QUE le virement instantané : un retrait
    // standard de montant élevé ne doit pas être bloqué par cette évolution.
    await expect(resolve({ amount: 50_000 })).resolves.toEqual({
      method: 'standard',
      explicit: false,
    });
  });

  // ─── Chemin nominal ────────────────────────────────────────────────────────

  it('destination explicite éligible + method=instant : destination retenue', async () => {
    seedCard('card_ok', { instantEligible: true });

    await expect(
      resolve({ payoutMethodId: 'card_ok', method: 'instant' }),
    ).resolves.toEqual({
      payoutMethodId: 'card_ok',
      method: 'instant',
      explicit: true,
    });
  });

  it('method=instant sans destination : retient la destination par défaut', async () => {
    seedCard('card_autre', { isDefault: false });
    seedCard('card_defaut', { isDefault: true });

    await expect(resolve({ method: 'instant' })).resolves.toEqual({
      payoutMethodId: 'card_defaut',
      method: 'instant',
      explicit: true,
    });
  });

  it('destination explicite sans method : versement standard vers cette destination', async () => {
    seedCard('card_ok', { instantEligible: false });

    await expect(resolve({ payoutMethodId: 'card_ok' })).resolves.toEqual({
      payoutMethodId: 'card_ok',
      method: 'standard',
      explicit: true,
    });
  });

  // ─── Cas d'erreur ──────────────────────────────────────────────────────────

  it('NO_PAYOUT_METHOD : destination appartenant à un autre investisseur (anti-IDOR)', async () => {
    // La carte existe… mais sur un AUTRE compte connecté.
    adapter.seed('acct_dun_tiers', {
      id: 'card_du_tiers',
      type: 'card',
      brand: 'visa',
      last4: '9999',
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
      instantEligible: true,
      currency: 'EUR',
      country: 'FR',
    });

    const error = await resolve({
      payoutMethodId: 'card_du_tiers',
      method: 'instant',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('NO_PAYOUT_METHOD');
  });

  it('NO_PAYOUT_METHOD : aucune destination enregistrée', async () => {
    const error = await resolve({ method: 'instant' }).catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('NO_PAYOUT_METHOD');
    expect(error.message).toMatch(/Ajoutez une carte/);
  });

  it('CARD_NOT_INSTANT_ELIGIBLE : carte non éligible au virement instantané', async () => {
    seedCard('card_std', { instantEligible: false });

    const error = await resolve({
      payoutMethodId: 'card_std',
      method: 'instant',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('CARD_NOT_INSTANT_ELIGIBLE');
  });

  it('CARD_NOT_INSTANT_ELIGIBLE : la même carte passe en method=standard', async () => {
    seedCard('card_std', { instantEligible: false });

    await expect(
      resolve({ payoutMethodId: 'card_std', method: 'standard' }),
    ).resolves.toEqual(
      expect.objectContaining({ payoutMethodId: 'card_std', method: 'standard' }),
    );
  });

  it.each([
    ['sous le plancher', INSTANT_PAYOUT_MIN_EUR - 0.01],
    ['au-dessus du plafond', INSTANT_PAYOUT_MAX_EUR + 0.01],
  ])('AMOUNT_OUT_OF_RANGE : montant %s', async (_label, amount) => {
    seedCard('card_ok', { instantEligible: true });

    const error = await resolve({
      amount,
      payoutMethodId: 'card_ok',
      method: 'instant',
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('AMOUNT_OUT_OF_RANGE');
  });

  it('AMOUNT_OUT_OF_RANGE est contrôlé AVANT toute lecture de destination', async () => {
    const find = jest.spyOn(adapter, 'find');

    await resolve({
      amount: 100_000,
      payoutMethodId: 'card_ok',
      method: 'instant',
    }).catch(() => undefined);

    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    [INSTANT_PAYOUT_MIN_EUR, true],
    [INSTANT_PAYOUT_MAX_EUR, true],
    [INSTANT_PAYOUT_MIN_EUR - 1, false],
    [INSTANT_PAYOUT_MAX_EUR + 1, false],
    [Number.NaN, false],
  ])('bornes du domaine : %s -> %s', (amount, expected) => {
    expect(isInstantPayoutAmountAllowed(amount as number)).toBe(expected);
  });
});
