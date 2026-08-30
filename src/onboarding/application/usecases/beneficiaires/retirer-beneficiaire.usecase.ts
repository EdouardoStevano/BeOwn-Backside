import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
  type RegistreDesBeneficiairesRepository,
} from 'src/onboarding/domain/repositories/registre-des-beneficiaires.repository';
import { EventBus } from '@nestjs/cqrs';
import { BeneficiaireEffectifSnapshot } from 'src/onboarding/domain/entities/beneficiaire-effectif';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/onboarding/domain/repositories/dossier-de-pieces.repository';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';
import { annoncerLaCompletude } from '../pieces/annoncer-la-completude';

/**
 * Retrait d'un bénéficiaire effectif du registre d'une société.
 *
 * **La racine vérifie l'appartenance avant l'effacement.** Le contrôleur le
 * faisait à la main, en glissant `profilPMId` dans le critère de suppression —
 * une garde juste, mais écrite dans la couche HTTP et qu'il aurait suffi
 * d'oublier une fois pour que l'uuid d'un bénéficiaire déclaré ailleurs
 * l'efface. Elle est désormais dans `RegistreDesBeneficiaires.retirer`, et le
 * repository la double en base.
 *
 * Ce que ce retrait ne fait pas : supprimer la **pièce d'identité** déposée
 * pour cette personne. Elle vit dans `DossierDePieces`, avec son propre cycle
 * d'instruction et une conservation de cinq ans (RG-KYC-10) qui survit à la
 * correction d'un registre. Elle deviendra simplement une pièce que la règle de
 * complétude ne réclame plus.
 */
@Injectable()
export class RetirerBeneficiaireUseCase {
  constructor(
    @Inject(REGISTRE_DES_BENEFICIAIRES_REPOSITORY)
    private readonly registres: RegistreDesBeneficiairesRepository,
    private readonly getProfilPM: GetProfilPMUseCase,
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    userId: number,
    societeId: string,
    beneficiaireId: string,
  ): Promise<BeneficiaireEffectifSnapshot[]> {
    await this.getProfilPM.execute(userId, societeId);

    const registre = await this.registres.parSociete(societeId);

    // Lève `BeneficiaireEffectifIntrouvableError` si la personne n'est pas de
    // cette société : rien n'est effacé.
    registre.retirer(beneficiaireId);

    await this.registres.retirer(societeId, beneficiaireId);

    // Un retrait joue dans l'autre sens qu'une déclaration : la pièce
    // d'identité de cette personne n'est plus réclamée, et un dossier qui
    // n'attendait qu'elle devient complet. Le même geste couvre les deux
    // parce que c'est la même règle qui tranche.
    const dossier = await this.dossiers.parSociete(societeId);
    annoncerLaCompletude(
      this.eventBus,
      dossier,
      { id: societeId, utilisateurId: userId },
      registre.beneficiairesPublies.map((b) => b.id),
    );

    return registre.beneficiairesPublies;
  }
}
