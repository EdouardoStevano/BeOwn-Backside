import { ForbiddenException } from '@nestjs/common';
import { KycController } from './kyc.controller';
import type { DecideKycManualReviewUseCase } from 'src/onboarding/application/usecases/kyc/decide-kyc-manual-review.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/onboarding/domain/enums/kyc-status.enum';
import { KycMapper } from 'src/onboarding/domain/mappers/kyc.mapper';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';
import { UserRole } from 'src/iam/domain/enums/user.enum';

/**
 * Ce qui reste de `PATCH /kyc/:userId/status` côté présentation : qui a le
 * droit d'appeler, et le passage de la main au use case.
 *
 * Le gating « dossier en revue manuelle » (409) et les notifications qui
 * suivaient la décision ont quitté le contrôleur — ils sont éprouvés dans
 * `decide-kyc-manual-review.usecase.spec.ts` et dans les specs des abonnés.
 *
 * La route vivait sous `PATCH /profiles/:userId/kyc/status`, servie par
 * `ProfileController` ; cette URL reste ouverte via `KycLegacyProfilesController`,
 * qui délègue au même use case.
 */
describe('KycController.patchKycStatus', () => {
  let controller: KycController;
  let decideKycManualReview: { execute: jest.Mock };
  let userRepository: { findById: jest.Mock };

  const admin = { userId: 99, role: UserRole.COMPLIANCE } as never;

  // Le use case rend la racine, pas le dossier : c'est elle que la route sert.
  const dossierValide = () =>
    new DossierDEntreeEnRelation({
      investorId: 42,
      kycCase: KycMapper.restore({
        id: 'kyc-1',
        statut: KycStatus.VALIDE,
        niveau: KycNiveau.STANDARD,
        fournisseur: 'stripeIdentity',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

  beforeEach(() => {
    decideKycManualReview = {
      execute: jest.fn().mockResolvedValue(dossierValide()),
    };
    // Le contrôleur relit le rôle par le port d'IAM.
    userRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ userId: 99, role: UserRole.COMPLIANCE }),
    };

    controller = new KycController(
      undefined as never, // createKyc
      undefined as never, // getKyc
      undefined as never, // getKycImages
      undefined as never, // requestKycManualReview
      decideKycManualReview as unknown as DecideKycManualReviewUseCase,
      undefined as never, // startKycSession
      undefined as never, // consultKycSession
      undefined as never, // synchroniserLaVerification
      undefined as never, // deposerPieceIdentite
      userRepository as never,
    );
  });

  it("transmet la décision et l'identité de son auteur", async () => {
    const kyc = await controller.patchKycStatus(
      42,
      { status: KycStatus.REFUSE, motifRefus: 'Document illisible' },
      admin,
    );

    expect(decideKycManualReview.execute).toHaveBeenCalledWith({
      decision: KycStatus.REFUSE,
      motifRefus: 'Document illisible',
      // Repris du porteur du token, jamais du corps de la requête : c'est ce
      // qui sera tracé comme auteur de la décision.
      decidePar: 99,
      utilisateurId: 42,
    });
    expect(kyc.statutKyc).toBe(KycStatus.VALIDE);
  });

  it('rejette (403) un appelant non-reviewer avant toute décision', async () => {
    // Défense en profondeur : `@RequirePermission('kyc:validate')` filtre déjà,
    // ce contrôle relit le rôle en base au cas où le token porterait un rôle
    // périmé.
    userRepository.findById.mockResolvedValue({
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
