import { ForbiddenException } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import type { DecideKycManualReviewUseCase } from 'src/profiles/applications/usecases/decide-kyc-manual-review.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/profiles/domains/enums/kyc-status.enum';
import { KycMapper } from 'src/profiles/domains/mappers/kyc.mapper';
import { UserRole } from 'src/iam/domains/enums/user.enum';

/**
 * Ce qui reste de `PATCH /profiles/:userId/kyc/status` côté présentation : qui
 * a le droit d'appeler, et le passage de la main au use case.
 *
 * Le gating « dossier en revue manuelle » (409) et les notifications qui
 * suivaient la décision ont quitté le contrôleur — ils sont éprouvés dans
 * `decide-kyc-manual-review.usecase.spec.ts` et dans les specs des abonnés.
 */
describe('ProfileController.patchKycStatus', () => {
  let controller: ProfileController;
  let decideKycManualReview: { execute: jest.Mock };
  let userRepo: { findOne: jest.Mock };

  const admin = { userId: 99, role: UserRole.COMPLIANCE } as never;

  const dossierValide = () =>
    KycMapper.restore({
      id: 'kyc-1',
      utilisateurId: 42,
      statut: KycStatus.VALIDE,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    decideKycManualReview = {
      execute: jest.fn().mockResolvedValue(dossierValide()),
    };
    userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ userId: 99, role: UserRole.COMPLIANCE }),
    };

    controller = new ProfileController(
      undefined as never, // createProfilPP
      undefined as never, // createKyc
      undefined as never, // requestKycManualReview
      decideKycManualReview as unknown as DecideKycManualReviewUseCase,
      undefined as never, // getProfilPP
      undefined as never, // updateProfilPP
      undefined as never, // createProfilPM
      undefined as never, // getProfilPM
      undefined as never, // updateProfilPM
      undefined as never, // getKyc
      undefined as never, // saveQuestionnaireUseCase
      undefined as never, // questionnaireRepo
      userRepo as never,
    );
  });

  it("transmet la décision et l'identité de son auteur", async () => {
    const kyc = await controller.patchKycStatus(
      42,
      { status: KycStatus.REFUSE, motifRefus: 'Document illisible' },
      admin,
    );

    expect(decideKycManualReview.execute).toHaveBeenCalledWith({
      utilisateurId: 42,
      decision: KycStatus.REFUSE,
      motifRefus: 'Document illisible',
      // Repris du porteur du token, jamais du corps de la requête : c'est ce
      // qui sera tracé comme auteur de la décision.
      decidePar: 99,
    });
    expect(kyc.statut).toBe(KycStatus.VALIDE);
  });

  it('rejette (403) un appelant non-reviewer avant toute décision', async () => {
    // Défense en profondeur : `@RequirePermission('kyc:validate')` filtre déjà,
    // ce contrôle relit le rôle en base au cas où le token porterait un rôle
    // périmé.
    userRepo.findOne.mockResolvedValue({
      userId: 5,
      role: UserRole.INVESTISSEUR,
    });

    await expect(
      controller.patchKycStatus(42, { status: KycStatus.VALIDE }, {
        userId: 5,
        role: UserRole.INVESTISSEUR,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(decideKycManualReview.execute).not.toHaveBeenCalled();
  });
});
