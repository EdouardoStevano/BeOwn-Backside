import { GUARDS_METADATA } from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PayoutMethodsController } from './payout-methods.controller';
import { PayoutMethodExceptionFilter } from './payout-method-exception.filter';
import { ManagePayoutMethodsUseCase } from '../../applications/usecases/manage-payout-methods.usecase';
import { InMemoryPayoutMethodsAdapter } from '../../infrastructure/in-memory-payout-methods.adapter';
import { PayoutMethodError } from '../../applications/ports/payout-methods.port';
import { AttachPayoutMethodDto, CreateRetraitDto } from '../dto/payment.dto';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';

/**
 * Lot 4a — contrat HTTP des destinations de retrait.
 *
 * Le cas d'usage est instancié avec l'adaptateur EN MÉMOIRE (pas des mocks) :
 * les assertions portent donc sur un comportement réel de bout en bout, sans
 * base de données ni réseau.
 */
describe('PayoutMethodsController', () => {
  const ACCOUNT = 'acct_1';
  const user = { userId: 42, email: 'a@b.c', role: 'INVESTISSEUR' } as any;

  let controller: PayoutMethodsController;
  let usecase: ManagePayoutMethodsUseCase;
  let adapter: InMemoryPayoutMethodsAdapter;
  let connectAccounts: any;
  let metrics: any;

  const seedCard = (
    id: string,
    over: Partial<{ isDefault: boolean; instantEligible: boolean }> = {},
  ) =>
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

  beforeEach(() => {
    adapter = new InMemoryPayoutMethodsAdapter();
    connectAccounts = {
      getAccountStatus: jest.fn().mockResolvedValue({
        connected: true,
        accountId: ACCOUNT,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
    };
    metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    usecase = new ManagePayoutMethodsUseCase(
      connectAccounts,
      adapter,
      adapter,
      metrics,
    );
    controller = new PayoutMethodsController(usecase);
  });

  // ─── Gardes ────────────────────────────────────────────────────────────────

  it('toutes les routes sont gatées par JwtAuthGuard + KycValidatedGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PayoutMethodsController) ?? [];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(KycValidatedGuard);
  });

  // ─── GET /payments/connect/payout-methods ──────────────────────────────────

  it('GET payout-methods : { methods, connectStatus }, défaut en tête', async () => {
    seedCard('card_a', { isDefault: false });
    seedCard('card_b', { isDefault: true, instantEligible: false });

    const res = await controller.list(user);

    expect(res.methods.map((m) => m.id)).toEqual(['card_b', 'card_a']);
    expect(res.methods[0]).toEqual(
      expect.objectContaining({
        id: 'card_b',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
        instantEligible: false,
        currency: 'EUR',
        country: 'FR',
      }),
    );
    expect(res.connectStatus).toEqual(
      expect.objectContaining({ accountId: ACCOUNT, payoutsEnabled: true }),
    );
  });

  it('GET payout-methods : sans compte connecté, liste vide (pas une erreur)', async () => {
    connectAccounts.getAccountStatus.mockResolvedValue({
      connected: false,
      accountId: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });

    const res = await controller.list(user);

    expect(res.methods).toEqual([]);
    expect(res.connectStatus.connected).toBe(false);
  });

  // ─── POST /payments/connect/payout-methods ─────────────────────────────────

  it('POST payout-methods : attache la carte et renvoie la vue', async () => {
    const created = await controller.attach({ token: 'tok_visa_debit' }, user);

    expect(created).toEqual(
      expect.objectContaining({ isDefault: true, instantEligible: true, type: 'card' }),
    );
    expect(created.id).toBeTruthy();
  });

  it('POST payout-methods : sans compte connecté → CONNECT_NOT_READY', async () => {
    connectAccounts.getAccountStatus.mockResolvedValue({
      connected: false,
      accountId: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });

    const error = await controller
      .attach({ token: 'tok_visa_debit' }, user)
      .catch((e) => e);

    expect(error).toBeInstanceOf(PayoutMethodError);
    expect(error.code).toBe('CONNECT_NOT_READY');
  });

  it('POST payout-methods : carte refusée → CARD_REJECTED', async () => {
    adapter.rejectNextAttach('Cette carte a été refusée.');

    const error = await controller
      .attach({ token: 'tok_visa_debit' }, user)
      .catch((e) => e);

    expect(error.code).toBe('CARD_REJECTED');
  });

  // ─── DELETE / PATCH ────────────────────────────────────────────────────────

  it('DELETE payout-methods/:id : { success: true }', async () => {
    seedCard('card_a', { isDefault: true });
    seedCard('card_b', { isDefault: false });

    await expect(controller.detach('card_b', user)).resolves.toEqual({ success: true });
  });

  it('DELETE payout-methods/:id : destination d\'un tiers → NO_PAYOUT_METHOD (anti-IDOR)', async () => {
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

    const error = await controller.detach('card_du_tiers', user).catch((e) => e);

    expect(error.code).toBe('NO_PAYOUT_METHOD');
    // La destination du tiers n'a pas été touchée.
    await expect(adapter.find('acct_dun_tiers', 'card_du_tiers')).resolves.not.toBeNull();
  });

  it('DELETE payout-methods/:id : destination par défaut → CANNOT_DELETE_DEFAULT', async () => {
    seedCard('card_a', { isDefault: true });
    seedCard('card_b', { isDefault: false });

    const error = await controller.detach('card_a', user).catch((e) => e);

    expect(error.code).toBe('CANNOT_DELETE_DEFAULT');
  });

  it('PATCH payout-methods/:id/default : { id, isDefault: true }', async () => {
    seedCard('card_a', { isDefault: true });
    seedCard('card_b', { isDefault: false });

    await expect(controller.setDefault('card_b', user)).resolves.toEqual({
      id: 'card_b',
      isDefault: true,
    });
  });

  // ─── GET /payments/connect/instant-balance ─────────────────────────────────

  it('GET instant-balance : { available, instantAvailable, currency }', async () => {
    adapter.setBalance(ACCOUNT, {
      available: 250.75,
      instantAvailable: 200,
      currency: 'EUR',
    });

    await expect(controller.instantBalance(user)).resolves.toEqual({
      available: 250.75,
      instantAvailable: 200,
      currency: 'EUR',
    });
  });

  it('GET instant-balance : sans compte connecté → CONNECT_NOT_READY', async () => {
    connectAccounts.getAccountStatus.mockResolvedValue({
      connected: false,
      accountId: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    });

    const error = await controller.instantBalance(user).catch((e) => e);

    expect(error.code).toBe('CONNECT_NOT_READY');
  });
});

describe('PayoutMethodExceptionFilter — codes métier vers HTTP', () => {
  const runFilter = (error: PayoutMethodError) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host: any = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };
    new PayoutMethodExceptionFilter().catch(error, host);
    return { status, json };
  };

  it.each([
    ['CONNECT_NOT_READY', HttpStatus.CONFLICT],
    ['CANNOT_DELETE_DEFAULT', HttpStatus.CONFLICT],
    ['NO_PAYOUT_METHOD', HttpStatus.UNPROCESSABLE_ENTITY],
    ['CARD_NOT_INSTANT_ELIGIBLE', HttpStatus.UNPROCESSABLE_ENTITY],
    ['CARD_REJECTED', HttpStatus.UNPROCESSABLE_ENTITY],
    ['AMOUNT_OUT_OF_RANGE', HttpStatus.UNPROCESSABLE_ENTITY],
  ])('%s -> %s', (code, expected) => {
    const { status, json } = runFilter(
      new PayoutMethodError(code as any, 'Message utilisateur.'),
    );

    expect(status).toHaveBeenCalledWith(expected);
    expect(json).toHaveBeenCalledWith({
      statusCode: expected,
      code,
      message: 'Message utilisateur.',
    });
  });
});

describe('DTO — validation aux frontières', () => {
  const errorsOf = async (cls: any, payload: any): Promise<string[]> => {
    const dto = plainToInstance(cls, payload);
    const errors = await validate(dto as object, { whitelist: true });
    return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
  };

  it('AttachPayoutMethodDto : accepte un token Stripe.js', async () => {
    await expect(
      errorsOf(AttachPayoutMethodDto, { token: 'tok_1Nxxxx' }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['un numéro de carte', '4000056655665556'],
    ['un payment method', 'pm_1Nxxxx'],
    ['une chaîne vide', ''],
  ])('AttachPayoutMethodDto : refuse %s', async (_label, token) => {
    await expect(errorsOf(AttachPayoutMethodDto, { token })).resolves.toContain('token');
  });

  it('CreateRetraitDto : accepte payoutMethodId + method', async () => {
    await expect(
      errorsOf(CreateRetraitDto, {
        amount: 100,
        currency: 'EUR',
        payoutMethodId: 'card_1Nxxxx',
        method: 'instant',
      }),
    ).resolves.toEqual([]);
  });

  it('CreateRetraitDto : CURRENCY_NOT_SUPPORTED — seul EUR est accepté', async () => {
    await expect(
      errorsOf(CreateRetraitDto, { amount: 100, currency: 'USD' }),
    ).resolves.toContain('currency');
  });

  it('CreateRetraitDto : refuse un mode de versement inconnu', async () => {
    await expect(
      errorsOf(CreateRetraitDto, { amount: 100, currency: 'EUR', method: 'express' }),
    ).resolves.toContain('method');
  });

  it('CreateRetraitDto : refuse un payoutMethodId au format invalide', async () => {
    await expect(
      errorsOf(CreateRetraitDto, {
        amount: 100,
        currency: 'EUR',
        payoutMethodId: '../../etc/passwd',
      }),
    ).resolves.toContain('payoutMethodId');
  });

  it('CreateRetraitDto : le minimum de retrait historique (10 €) est conservé', async () => {
    await expect(
      errorsOf(CreateRetraitDto, { amount: 5, currency: 'EUR' }),
    ).resolves.toContain('amount');
  });
});
