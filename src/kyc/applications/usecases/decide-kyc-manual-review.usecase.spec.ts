import type { EventBus } from '@nestjs/cqrs';
import { DecideKycManualReviewUseCase } from './decide-kyc-manual-review.usecase';
import type { GetKycUseCase } from './get-kyc.usecase';
import type { UpdateKycStatusUseCase } from './update-kyc-status.usecase';
import { KycNiveau, KycStatus } from 'src/kyc/domains/enums/kyc-status.enum';
import { KycPasEnRevueManuelleError } from 'src/kyc/domains/errors';
import { KycRefuseDomainEvent } from 'src/kyc/domains/events/kyc-refuse.domain-event';
import { KycValideDomainEvent } from 'src/kyc/domains/events/kyc-valide.domain-event';
import { KycMapper } from 'src/kyc/domains/mappers/kyc.mapper';

const dossier = (statut: KycStatus) =>
  KycMapper.restore({
    id: 'kyc-1',
    utilisateurId: 42,
    statut,
    niveau: KycNiveau.STANDARD,
    fournisseur: 'stripeIdentity',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

function monter(statutCourant: KycStatus = KycStatus.EN_REVUE) {
  const mocks = {
    getKyc: jest.fn().mockResolvedValue(dossier(statutCourant)),
    updateStatut: jest
      .fn()
      .mockImplementation((_userId: number, statut: KycStatus) =>
        Promise.resolve(dossier(statut)),
      ),
    publish: jest.fn(),
  };

  const useCase = new DecideKycManualReviewUseCase(
    { execute: mocks.getKyc } as unknown as GetKycUseCase,
    { execute: mocks.updateStatut } as unknown as UpdateKycStatusUseCase,
    { publish: mocks.publish } as unknown as EventBus,
  );

  return { useCase, mocks };
}

const DECISION = { utilisateurId: 42, decidePar: 99 };

describe('DecideKycManualReviewUseCase', () => {
  /**
   * Le KYC est validé AUTOMATIQUEMENT par Stripe Identity (webhook). L'admin ne
   * peut trancher QUE sur un dossier en revue manuelle — un dossier auto-validé
   * ou pas encore soumis reste en lecture seule pour lui.
   */
  describe('gating revue manuelle', () => {
    it.each([
      ['non_demarre soumis', KycStatus.NON_DEMARRE],
      ['en_cours (Stripe processing)', KycStatus.EN_COURS],
      ['déjà auto-validé par Stripe', KycStatus.VALIDE],
      ['refusé précédemment', KycStatus.REFUSE],
    ])('refuse une décision quand le dossier est %s', async (_l, statut) => {
      const { useCase, mocks } = monter(statut);

      await expect(
        useCase.execute({ ...DECISION, decision: KycStatus.VALIDE }),
      ).rejects.toBeInstanceOf(KycPasEnRevueManuelleError);

      expect(mocks.updateStatut).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    });
  });

  it('valide le dossier et annonce le fait', async () => {
    const { useCase, mocks } = monter();

    const kyc = await useCase.execute({
      ...DECISION,
      decision: KycStatus.VALIDE,
    });

    expect(mocks.updateStatut).toHaveBeenCalledWith(
      42,
      KycStatus.VALIDE,
      undefined,
    );
    expect(kyc.statut).toBe(KycStatus.VALIDE);

    const [event] = mocks.publish.mock.calls[0] as [KycValideDomainEvent];
    expect(event).toBeInstanceOf(KycValideDomainEvent);
    expect(event.kycId).toBe('kyc-1');
    expect(event.utilisateurId).toBe(42);
    expect(event.decidePar).toBe(99);
  });

  it('refuse le dossier et annonce le fait avec son motif', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute({
      ...DECISION,
      decision: KycStatus.REFUSE,
      motifRefus: 'Document illisible',
    });

    expect(mocks.updateStatut).toHaveBeenCalledWith(
      42,
      KycStatus.REFUSE,
      'Document illisible',
    );

    const [event] = mocks.publish.mock.calls[0] as [KycRefuseDomainEvent];
    expect(event).toBeInstanceOf(KycRefuseDomainEvent);
    expect(event.motifRefus).toBe('Document illisible');
    expect(event.decidePar).toBe(99);
  });

  it('accepte un refus non motivé', async () => {
    const { useCase, mocks } = monter();

    await useCase.execute({ ...DECISION, decision: KycStatus.REFUSE });

    const [event] = mocks.publish.mock.calls[0] as [KycRefuseDomainEvent];
    expect(event.motifRefus).toBeNull();
  });

  it("n'annonce rien pour un statut qui n'est ni validé ni refusé", async () => {
    // La route acceptait déjà ces statuts sans prévenir personne : il n'y a pas
    // de fait métier à annoncer quand un admin repositionne un dossier en cours
    // d'examen.
    const { useCase, mocks } = monter();

    await useCase.execute({ ...DECISION, decision: KycStatus.EN_COURS });

    expect(mocks.updateStatut).toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("n'annonce rien quand l'écriture du statut échoue", async () => {
    const { useCase, mocks } = monter();
    mocks.updateStatut.mockRejectedValue(new Error('base indisponible'));

    await expect(
      useCase.execute({ ...DECISION, decision: KycStatus.VALIDE }),
    ).rejects.toThrow('base indisponible');
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
