import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { KycStatus } from 'src/profiles/domains/enums/kyc-status.enum';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Le KYC est validé AUTOMATIQUEMENT par Stripe Identity (webhook). L'admin ne
 * peut agir manuellement (PATCH /profiles/:userId/kyc/status) QUE sur un
 * dossier en revue manuelle (EN_REVUE) — un dossier auto-validé ou pas encore
 * soumis doit rester en lecture seule pour l'admin (409).
 */
describe('ProfileController.patchKycStatus — gating revue manuelle', () => {
  let controller: ProfileController;
  let getKyc: any;
  let updateKycStatus: any;
  let userRepo: any;
  let notifications: any;
  let notificationEvents: any;
  let metricsPort: any;
  let transactionalEmails: any;

  const admin = { userId: 99, role: UserRole.COMPLIANCE } as any;

  beforeEach(() => {
    getKyc = { execute: jest.fn(), executeAll: jest.fn() };
    updateKycStatus = { execute: jest.fn() };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ userId: 99, role: UserRole.COMPLIANCE }),
    };
    notifications = { push: jest.fn().mockResolvedValue(undefined) };
    notificationEvents = {
      kycValidatedByAdmin: jest.fn(),
      kycRejectedByAdmin: jest.fn(),
    };
    metricsPort = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };
    const profilRepository: any = {
      countKycByStatus: jest.fn().mockResolvedValue(0),
    };
    transactionalEmails = {
      kycValide: jest.fn().mockResolvedValue(undefined),
      kycRefuse: jest.fn().mockResolvedValue(undefined),
    };

    controller = new ProfileController(
      undefined as any, // createProfilPP
      undefined as any, // createKyc
      updateKycStatus,
      undefined as any, // getProfilPP
      undefined as any, // updateProfilPP
      undefined as any, // createProfilPM
      getKyc,
      undefined as any, // saveQuestionnaireUseCase
      undefined as any, // questionnaireRepo
      userRepo,
      notifications,
      notificationEvents,
      profilRepository,
      metricsPort,
      undefined as any, // saveTestConnaissancesUseCase
      transactionalEmails,
    );
  });

  it.each([
    ['non_demarre soumis', KycStatus.NON_DEMARRE],
    ['en_cours (Stripe processing)', KycStatus.EN_COURS],
    ['déjà auto-validé par Stripe', KycStatus.VALIDE],
    ['refusé précédemment', KycStatus.REFUSE],
  ])(
    'rejette (409) une décision admin quand le dossier est %s',
    async (_label, statut) => {
      getKyc.execute.mockResolvedValue({ id: 'kyc-1', statut });

      await expect(
        controller.patchKycStatus(
          42,
          { status: KycStatus.VALIDE } as any,
          admin,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(updateKycStatus.execute).not.toHaveBeenCalled();
    },
  );

  it('autorise la décision admin quand le dossier est en revue manuelle (EN_REVUE)', async () => {
    getKyc.execute.mockResolvedValue({ id: 'kyc-1', statut: KycStatus.EN_REVUE });
    updateKycStatus.execute.mockResolvedValue({ id: 'kyc-1', statut: KycStatus.VALIDE });

    const result = await controller.patchKycStatus(
      42,
      { status: KycStatus.VALIDE } as any,
      admin,
    );

    expect(updateKycStatus.execute).toHaveBeenCalledWith(42, KycStatus.VALIDE, undefined);
    expect(result).toEqual({ id: 'kyc-1', statut: KycStatus.VALIDE });
    expect(notificationEvents.kycValidatedByAdmin).toHaveBeenCalledWith(42, 99);
  });

  it('autorise aussi le refus admin quand le dossier est en revue manuelle', async () => {
    getKyc.execute.mockResolvedValue({ id: 'kyc-1', statut: KycStatus.EN_REVUE });
    updateKycStatus.execute.mockResolvedValue({ id: 'kyc-1', statut: KycStatus.REFUSE });

    await controller.patchKycStatus(
      42,
      { status: KycStatus.REFUSE, motifRefus: 'Document illisible' } as any,
      admin,
    );

    expect(updateKycStatus.execute).toHaveBeenCalledWith(42, KycStatus.REFUSE, 'Document illisible');
    expect(notificationEvents.kycRejectedByAdmin).toHaveBeenCalledWith(42, 'Document illisible', 99);
  });

  it('rejette avant tout accès à updateKycStatus si utilisateur non-reviewer (403 prioritaire)', async () => {
    userRepo.findOne.mockResolvedValue({ userId: 5, role: UserRole.INVESTISSEUR });
    getKyc.execute.mockResolvedValue({ id: 'kyc-1', statut: KycStatus.EN_REVUE });

    await expect(
      controller.patchKycStatus(42, { status: KycStatus.VALIDE } as any, {
        userId: 5,
        role: UserRole.INVESTISSEUR,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(updateKycStatus.execute).not.toHaveBeenCalled();
  });
});
