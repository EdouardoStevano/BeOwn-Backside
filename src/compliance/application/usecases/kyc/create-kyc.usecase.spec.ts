import { CreateKycUseCase } from './create-kyc.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/compliance/domain/enums/kyc-status.enum';
import { ChampKycInvalideError } from 'src/compliance/domain/errors';
import { InvestorComplianceProfile } from 'src/compliance/domain/aggregates/investor-compliance-profile';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { KycMapper } from 'src/compliance/domain/mappers/kyc.mapper';
import type { InvestorComplianceProfileRepository } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';

/**
 * Le port est celui de la **racine**, pas du dossier.
 *
 * `KycCase` est une entité interne au dossier de conformité : elle n'a plus de
 * repository à elle, et le use case ne peut donc plus l'ouvrir directement. Il
 * charge la racine, lui dépose un dossier, et la réenregistre (§6, §10).
 */
function monter(existant: KycCase | null = null) {
  const profil = new InvestorComplianceProfile({
    investorId: 42,
    kycCase: existant,
    adequacy: null,
  });

  // Les mocks sont tenus à part plutôt que relus sur le port : lire une méthode
  // d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    findByInvestorId: jest.fn().mockResolvedValue(profil),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((p: InvestorComplianceProfile) => Promise.resolve(p)),
  };
  const profils: InvestorComplianceProfileRepository = mocks;

  return { useCase: new CreateKycUseCase(profils), mocks, profil };
}

describe('CreateKycUseCase', () => {
  it('ouvre un dossier vierge pour le compte', async () => {
    const { useCase, mocks } = monter();

    const enregistre = await useCase.execute(42);

    expect(enregistre.investorId).toBe(42);
    expect(enregistre.statutKyc).toBe(KycStatus.NON_DEMARRE);
    expect(enregistre.dossierKycPublie?.niveau).toBe(KycNiveau.STANDARD);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('est idempotent : un second appel rend le dossier existant', async () => {
    // Le front rappelle la route à chaque reprise du parcours, et
    // `StartKycSessionUseCase` l'appelle sans savoir si le dossier existe.
    // Un 409 obligerait chacun à rattraper l'erreur pour relire le dossier.
    const existant = KycMapper.restore({
      id: 'kyc-1',
      statut: KycStatus.EN_COURS,
      niveau: KycNiveau.STANDARD,
      fournisseur: 'stripeIdentity',
      fournisseurRef: 'vs_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { useCase, mocks, profil } = monter(existant);

    const enregistre = await useCase.execute(42);

    expect(enregistre).toBe(profil);
    expect(enregistre.statutKyc).toBe(KycStatus.EN_COURS);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  // Le test « ne persiste rien quand le compte visé est invalide » a disparu
  // avec la clé qu'il éprouvait : le dossier ne porte plus le titulaire. C'est
  // la clé étrangère de `investor_compliance_profile` vers `users` qui refuse
  // désormais un compte inexistant, et la racine qui la porte.
});
