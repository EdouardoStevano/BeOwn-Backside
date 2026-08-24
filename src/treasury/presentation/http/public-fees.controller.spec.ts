import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/iam/presentation/decorators/public.decorator';
import { PublicFeesController } from './public-fees.controller';
import {
  DEFAULT_FEE_RATES,
  PlatformFeeRates,
  PlatformFeesService,
} from '../../application/services/platform-fees.service';

describe('PublicFeesController', () => {
  let controller: PublicFeesController;

  const mockPlatformFees = { getRates: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicFeesController],
      providers: [{ provide: PlatformFeesService, useValue: mockPlatformFees }],
    }).compile();

    controller = moduleRef.get(PublicFeesController);
    jest.clearAllMocks();
  });

  it('marque la route GET comme publique (@Public)', () => {
    const reflector = new Reflector();
    // Métadonnées lues sur la méthode du prototype (une copie bindée
    // perdrait les métadonnées posées par le décorateur).
    const handler = Object.getOwnPropertyDescriptor(
      PublicFeesController.prototype,
      'getFees',
    )?.value as () => Promise<PlatformFeeRates>;
    const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, handler);

    expect(isPublic).toBe(true);
  });

  it('renvoie les 5 taux exposés par PlatformFeesService (forme + types)', async () => {
    mockPlatformFees.getRates.mockResolvedValue(DEFAULT_FEE_RATES);

    const result: PlatformFeeRates = await controller.getFees();

    expect(mockPlatformFees.getRates).toHaveBeenCalledTimes(1);
    const keys: (keyof PlatformFeeRates)[] = [
      'annualPlatformFeePct',
      'rentManagementFeePct',
      'propertySaleGainFeePct',
      'resaleTransactionFeePct',
      'shareSaleGainFeePct',
    ];
    expect(Object.keys(result).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(typeof result[key]).toBe('number');
    }
  });

  it('renvoie exactement les valeurs fournies par le service (pas de transformation)', async () => {
    const rates: PlatformFeeRates = {
      annualPlatformFeePct: 2.4,
      rentManagementFeePct: 8,
      propertySaleGainFeePct: 20,
      resaleTransactionFeePct: 1.5,
      shareSaleGainFeePct: 12,
    };
    mockPlatformFees.getRates.mockResolvedValue(rates);

    await expect(controller.getFees()).resolves.toEqual(rates);
  });
});
