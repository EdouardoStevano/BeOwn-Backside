import { Inject, Injectable } from '@nestjs/common';
import { DossierDEntreeEnRelation } from 'src/onboarding/domain/aggregates/dossier-d-entree-en-relation';
import { KycFactory } from 'src/onboarding/domain/factories/kyc.factory';
import {
  DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
  type DossierDEntreeEnRelationRepository,
} from 'src/onboarding/domain/repositories/dossier-d-entree-en-relation.repository';

/**
 * Ouvre le dossier de vérification d'un titulaire, s'il n'en a pas déjà un.
 *
 * **Idempotent** : un second appel rend le dossier existant sans rien écrire.
 * C'est ce qui permet à `StartKycSessionUseCase` de l'appeler sans se demander
 * si le titulaire a déjà commencé, et à une reprise de parcours de ne pas
 * effacer ce qui a été vérifié.
 *
 * Il passait par un `KycRepository` propre à l'entité `KycCase` ; il passe
 * désormais par la racine, seule à savoir si le titulaire a un dossier et
 * seule habilitée à lui en déposer un (§6, §10).
 */
@Injectable()
export class CreateKycUseCase {
  constructor(
    @Inject(DOSSIER_ENTREE_EN_RELATION_REPOSITORY)
    private readonly profils: DossierDEntreeEnRelationRepository,
  ) {}

  async execute(userId: number): Promise<DossierDEntreeEnRelation> {
    const profil = await this.profils.parTitulaire(userId);
    if (profil.aUnDossierKyc()) return profil;

    profil.deposerDossierKyc(KycFactory.creer());
    return this.profils.save(profil);
  }
}
