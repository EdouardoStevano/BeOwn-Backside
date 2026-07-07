import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DEFAULT_FEE_RATES,
  PlatformFeesService,
} from './platform-fees.service';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';

describe('PlatformFeesService', () => {
  let service: PlatformFeesService;

  const mockSettingsRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformFeesService,
        {
          provide: getRepositoryToken(AdminSettingsEntity),
          useValue: mockSettingsRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(PlatformFeesService);
    jest.clearAllMocks();
  });

  const withCommissions = (commissions: unknown) =>
    mockSettingsRepo.findOne.mockResolvedValue({
      id: 'default',
      settings: { commissions },
    });

  describe('getRates', () => {
    it('renvoie les taux par défaut quand aucune ligne settings', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      const rates = await service.getRates();

      expect(rates).toEqual(DEFAULT_FEE_RATES);
      expect(mockSettingsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'default' },
      });
    });

    it('renvoie les taux par défaut quand le blob ne contient pas commissions', async () => {
      mockSettingsRepo.findOne.mockResolvedValue({
        id: 'default',
        settings: {},
      });

      await expect(service.getRates()).resolves.toEqual(DEFAULT_FEE_RATES);
    });

    it('les valeurs du blob priment sur les défauts', async () => {
      withCommissions({
        annualPlatformFeePct: 2,
        rentManagementFeePct: 8,
        propertySaleGainFeePct: 20,
        resaleTransactionFeePct: 1.5,
        shareSaleGainFeePct: 12,
      });

      await expect(service.getRates()).resolves.toEqual({
        annualPlatformFeePct: 2,
        rentManagementFeePct: 8,
        propertySaleGainFeePct: 20,
        resaleTransactionFeePct: 1.5,
        shareSaleGainFeePct: 12,
      });
    });

    it('fusionne un blob partiel : clés absentes → défauts', async () => {
      withCommissions({ rentManagementFeePct: 5 });

      await expect(service.getRates()).resolves.toEqual({
        ...DEFAULT_FEE_RATES,
        rentManagementFeePct: 5,
      });
    });

    it('accepte 0 comme valeur valide (frais désactivé)', async () => {
      withCommissions({ annualPlatformFeePct: 0 });

      const rates = await service.getRates();

      expect(rates.annualPlatformFeePct).toBe(0);
    });

    it('ignore les valeurs non finies ou non numériques → défauts', async () => {
      withCommissions({
        annualPlatformFeePct: Number.NaN,
        rentManagementFeePct: Number.POSITIVE_INFINITY,
        propertySaleGainFeePct: '15',
        resaleTransactionFeePct: null,
        shareSaleGainFeePct: undefined,
      });

      await expect(service.getRates()).resolves.toEqual(DEFAULT_FEE_RATES);
    });

    it('ignore les clés legacy présentes en base (investmentFeePct…)', async () => {
      withCommissions({
        investmentFeePct: 1.5,
        secondaryMarketFeePct: 2,
        earlyExitFeePct: 1,
      });

      await expect(service.getRates()).resolves.toEqual(DEFAULT_FEE_RATES);
    });
  });

  describe('computeMonthlyPlatformFee', () => {
    it('calcule capital × (taux annuel / 100) / 12, arrondi à 2 décimales', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null); // défaut 1 %/an

      // 120 000 × 1 % / 12 = 100
      await expect(service.computeMonthlyPlatformFee(120_000)).resolves.toBe(
        100,
      );
    });

    it('arrondit à 2 décimales', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      // 100 000 × 1 % / 12 = 83.333… → 83.33
      await expect(service.computeMonthlyPlatformFee(100_000)).resolves.toBe(
        83.33,
      );
    });

    it('utilise le taux configuré en base', async () => {
      withCommissions({ annualPlatformFeePct: 2.4 });

      // 100 000 × 2.4 % / 12 = 200
      await expect(service.computeMonthlyPlatformFee(100_000)).resolves.toBe(
        200,
      );
    });

    it('renvoie 0 pour un capital de 0', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computeMonthlyPlatformFee(0)).resolves.toBe(0);
    });
  });

  describe('computeRentManagementFee', () => {
    it('calcule loyers × taux / 100', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null); // défaut 7 %

      await expect(service.computeRentManagementFee(1000)).resolves.toBe(70);
    });

    it('arrondit à 2 décimales', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      // 333.33 × 7 % = 23.3331 → 23.33
      await expect(service.computeRentManagementFee(333.33)).resolves.toBe(
        23.33,
      );
    });

    it('renvoie 0 si loyers = 0', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computeRentManagementFee(0)).resolves.toBe(0);
    });

    it('renvoie 0 si loyers négatifs', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computeRentManagementFee(-500)).resolves.toBe(0);
    });
  });

  describe('computePropertySaleGainFee', () => {
    it('calcule plus-value × taux / 100', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null); // défaut 15 %

      await expect(service.computePropertySaleGainFee(10_000)).resolves.toBe(
        1500,
      );
    });

    it('renvoie 0 si plus-value nulle', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computePropertySaleGainFee(0)).resolves.toBe(0);
    });

    it('renvoie 0 si moins-value (pas de frais sur perte)', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computePropertySaleGainFee(-2000)).resolves.toBe(0);
    });

    it('utilise le taux configuré en base', async () => {
      withCommissions({ propertySaleGainFeePct: 10 });

      await expect(service.computePropertySaleGainFee(10_000)).resolves.toBe(
        1000,
      );
    });
  });

  describe('computeResaleFees', () => {
    it('calcule frais de transaction et frais sur plus-value', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null); // défauts 1 % / 15 %

      await expect(service.computeResaleFees(5000, 200)).resolves.toEqual({
        transactionFee: 50,
        gainFee: 30,
      });
    });

    it('gainFee = 0 si plus-value vendeur ≤ 0, transactionFee inchangé', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      await expect(service.computeResaleFees(5000, -100)).resolves.toEqual({
        transactionFee: 50,
        gainFee: 0,
      });
      await expect(service.computeResaleFees(5000, 0)).resolves.toEqual({
        transactionFee: 50,
        gainFee: 0,
      });
    });

    it('arrondit chaque frais à 2 décimales', async () => {
      mockSettingsRepo.findOne.mockResolvedValue(null);

      // 3333.33 × 1 % = 33.3333 → 33.33 ; 66.66 × 15 % = 9.999 → 10
      await expect(service.computeResaleFees(3333.33, 66.66)).resolves.toEqual({
        transactionFee: 33.33,
        gainFee: 10,
      });
    });

    it('utilise les taux configurés en base', async () => {
      withCommissions({
        resaleTransactionFeePct: 2,
        shareSaleGainFeePct: 20,
      });

      await expect(service.computeResaleFees(1000, 500)).resolves.toEqual({
        transactionFee: 20,
        gainFee: 100,
      });
    });
  });

  describe('snapshot de taux (cohérence multi-frais — R1)', () => {
    it('ne relit pas la base quand un snapshot est fourni', async () => {
      const snapshot = { ...DEFAULT_FEE_RATES, annualPlatformFeePct: 2.4 };

      const fee = await service.computeMonthlyPlatformFee(100_000, snapshot);

      expect(fee).toBe(200); // 100 000 × 2.4 % / 12
      expect(mockSettingsRepo.findOne).not.toHaveBeenCalled();
    });

    it('le snapshot prime sur les taux en base (pas de dérive mi-opération)', async () => {
      // La base dit 50 %, mais l'opération a été démarrée avec un snapshot à 7 %
      withCommissions({ rentManagementFeePct: 50 });
      const snapshot = { ...DEFAULT_FEE_RATES, rentManagementFeePct: 7 };

      await expect(
        service.computeRentManagementFee(1000, snapshot),
      ).resolves.toBe(70);
      expect(mockSettingsRepo.findOne).not.toHaveBeenCalled();
    });

    it('computeResaleFees et computePropertySaleGainFee acceptent un snapshot', async () => {
      const snapshot = {
        ...DEFAULT_FEE_RATES,
        resaleTransactionFeePct: 2,
        shareSaleGainFeePct: 10,
        propertySaleGainFeePct: 20,
      };

      await expect(
        service.computeResaleFees(5000, 200, snapshot),
      ).resolves.toEqual({ transactionFee: 100, gainFee: 20 });
      await expect(
        service.computePropertySaleGainFee(10_000, snapshot),
      ).resolves.toBe(2000);
      expect(mockSettingsRepo.findOne).not.toHaveBeenCalled();
    });
  });
});
