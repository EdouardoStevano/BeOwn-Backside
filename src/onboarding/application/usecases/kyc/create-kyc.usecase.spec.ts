import { CreateKycUseCase } from './create-kyc.usecase';
import {
  KycNiveau,
  KycStatus,
} from 'src/onboarding/domain/enums/kyc-status.enum';
import { ChampKycInvalideError } from 'src/onboarding/domain/errors';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';
import { KycCase } from 'src/onboarding/domain/entities/kyc-case';
import { KycMapper } from 'src/onboarding/domain/mappers/kyc.mapper';
import type { DossierDEntreeEnRelationRepository } from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';

/**
 * Le port est celui de la **racine**, pas du dossier.
 *
 * `KycCase` est une entité interne au dossier de conformité : elle n'a plus de
 * repository à elle, et le use case ne peut donc plus l'ouvrir directement. Il
 * charge la racine, lui dépose un dossier, et la réenregistre (§6, §10).
 */
function monter(existant: KycCase | null = null) {
  const profil = new DossierDEntreeEnRelation({
    investorId: 42,
    kycCase: existant,
  });

  // Les mocks sont tenus à part plutôt que relus sur le port : lire une méthode
  // d'interface pour l'inspecter la détache de son objet.
  const mocks = {
    parTitulaire: jest.fn().mockResolvedValue(profil),
    // Le dossier d'une société n'a pas de KYC : ce use case ne le lit jamais,
    // et le mock le rappelle plutôt que de rendre un dossier plausible.
    parSociete: jest.fn(),
    // Le repository rend ce qu'il a reçu : la persistance n'est pas le sujet.
    save: jest.fn((p: DossierDEntreeEnRelation) => Promise.resolve(p)),
  };
  const profils: DossierDEntreeEnRelationRepository = mocks;

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
