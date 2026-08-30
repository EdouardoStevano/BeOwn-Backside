import { NotFoundException } from '@nestjs/common';
import type { EventBus } from '@nestjs/cqrs';
import {
  MOTIF_REVUE_MANUELLE,
  RequestKycManualReviewUseCase,
} from './request-kyc-manual-review.usecase';
import type { UpdateKycStatusUseCase } from './update-kyc-status.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/onboarding/domain/enums/kyc-status.enum';
import { KycRevueManuelleDemandeeDomainEvent } from 'src/onboarding/domain/events/kyc-revue-manuelle-demandee.domain-event';
import { KycMapper } from 'src/onboarding/domain/mappers/kyc.mapper';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';

// `UpdateKycStatusUseCase` rend la racine, pas le dossier : c'est elle qui
// porte le changement de statut (§6, §10).
const dossierEnRevue = () =>
  new DossierDEntreeEnRelation({
    investorId: 42,
    kycCase: KycMapper.restore({
      id: 'kyc-1',
      statut: KycStatus.EN_REVUE,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      motifRefus: MOTIF_REVUE_MANUELLE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  });

function monter() {
  const mocks = {
    execute: jest.fn().mockResolvedValue(dossierEnRevue()),
    publish: jest.fn(),
  };

  const useCase = new RequestKycManualReviewUseCase(
    { execute: mocks.execute } as unknown as UpdateKycStatusUseCase,
    { publish: mocks.publish } as unknown as EventBus,
  );

  return { useCase, mocks };
}

describe('RequestKycManualReviewUseCase', () => {
  it('passe le dossier en revue manuelle avec son motif', async () => {
    const { useCase, mocks } = monter();

    const kyc = await useCase.execute(42);

    expect(mocks.execute).toHaveBeenCalledWith(
      42,
      KycStatus.EN_REVUE,
      MOTIF_REVUE_MANUELLE,
    );
    expect(kyc.statutKyc).toBe(KycStatus.EN_REVUE);
  });

  it('annonce le fait métier une fois le dossier écrit', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute(42);

    expect(mocks.publish).toHaveBeenCalledTimes(1);
    const [event] = mocks.publish.mock.calls[0] as [
      KycRevueManuelleDemandeeDomainEvent,
    ];
    expect(event).toBeInstanceOf(KycRevueManuelleDemandeeDomainEvent);
    expect(event.kycId).toBe('kyc-1');
    expect(event.utilisateurId).toBe(42);
    expect(event.motif).toBe(MOTIF_REVUE_MANUELLE);
  });

  it("n'annonce rien quand le dossier n'a pas pu changer de statut", async () => {
    // Un abonné qui alerterait la compliance sur un passage en revue qui n'a
    // pas eu lieu la ferait chercher un dossier inexistant.
    const { useCase, mocks } = monter();
    mocks.execute.mockRejectedValue(new NotFoundException('KYC introuvable.'));

    await expect(useCase.execute(42)).rejects.toBeInstanceOf(NotFoundException);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
