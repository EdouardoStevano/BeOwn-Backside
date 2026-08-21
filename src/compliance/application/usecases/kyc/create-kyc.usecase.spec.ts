import { CreateKycUseCase } from './create-kyc.usecase';
import { KycNiveau, KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { ChampKycInvalideError } from 'src/compliance/domain/errors';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import type { KycRepository } from 'src/compliance/domain/repositories/kyc.repository';

function monter(existant: KycCase | null = null) {
  // Les mocks sont tenus à part plutôt que relus sur le port : lire une méthode
  // d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findByUserId: jest.fn().mockResolvedValue(existant),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((kyc: KycCase) => Promise.resolve(kyc)),
    findAll: jest.fn(),
    updateStatus: jest.fn(),
    updateSession: jest.fn(),
    updateReportData: jest.fn(),
  };
  const kycRepository: KycRepository = mocks;

  return { useCase: new CreateKycUseCase(kycRepository), mocks };
}

describe('CreateKycUseCase', () => {
  it('ouvre un dossier vierge pour le compte', async () => {
    const { useCase, mocks } = monter();

    const kyc = await useCase.execute(42);

    expect(kyc.utilisateurId).toBe(42);
    expect(kyc.statut).toBe(KycStatus.NON_DEMARRE);
    expect(kyc.niveau).toBe(KycNiveau.STANDARD);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('est idempotent : un second appel rend le dossier existant', async () => {
    // Le front rappelle la route à chaque reprise du parcours, et
    // `PaymentController.startKyc` l'appelle sans savoir si le dossier existe.
    // Un 409 obligerait chacun à rattraper l'erreur pour relire le dossier.
    const existant = KycMapper.restore({
      id: 'kyc-1',
      utilisateurId: 42,
      statut: KycStatus.EN_COURS,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      fournisseurRef: 'vs_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { useCase, mocks } = monter(existant);

    const kyc = await useCase.execute(42);

    expect(kyc).toBe(existant);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('ne persiste rien quand le compte visé est invalide', async () => {
    const { useCase, mocks } = monter();

    await expect(useCase.execute(0)).rejects.toBeInstanceOf(
      ChampKycInvalideError,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
