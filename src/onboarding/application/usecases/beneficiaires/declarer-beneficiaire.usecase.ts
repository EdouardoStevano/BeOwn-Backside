import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
  type RegistreDesBeneficiairesRepository,
} from 'src/onboarding/domain/repositories/registre-des-beneficiaires.repository';
import { EventBus } from '@nestjs/cqrs';
import { ChampsBeneficiaire } from 'src/onboarding/domain/entities/beneficiaire-effectif';
import { BeneficiaireEffectifSnapshot } from 'src/onboarding/domain/entities/beneficiaire-effectif';
import { RegistreDesBeneficiaires } from 'src/onboarding/domain/aggregates/registre-des-beneficiaires';
import {
  DOSSIER_DE_PIECES_REPOSITORY,
  type DossierDePiecesRepository,
} from 'src/onboarding/domain/repositories/dossier-de-pieces.repository';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';
import { annoncerLaCompletude } from '../pieces/annoncer-la-completude';

/**
 * Déclaration d'un bénéficiaire effectif au registre d'une société.
 *
 * Ce use case n'orchestre que des accès (§14) : vérifier que la société est
 * bien celle du demandeur, confier la déclaration au registre, persister. Ce
 * qui décide — le seuil de 25 %, la validité de la nationalité, le plafond des
 * détentions directes — vit dans `BeneficiaireEffectif` et
 * `RegistreDesBeneficiaires`, où cela s'éprouve sans base de données.
 *
 * Ce travail se faisait entièrement dans `BeneficiaireEffectifController`, qui
 * injectait `Repository<BeneficiaireEffectifEntity>` et appelait `create` puis
 * `save` : les seules règles écrites vivaient dans les décorateurs du DTO,
 * c'est-à-dire dans la couche HTTP (§27). Un import ou un script les aurait
 * contournées sans le savoir.
 */
@Injectable()
export class DeclarerBeneficiaireUseCase {
  constructor(
    @Inject(REGISTRE_DES_BENEFICIAIRES_REPOSITORY)
    private readonly registres: RegistreDesBeneficiairesRepository,
    // Le contrôle d'appartenance vit là, pour tous ses appelants — le recopier
    // ici en ferait une seconde version à tenir à jour.
    private readonly getProfilPM: GetProfilPMUseCase,
    @Inject(DOSSIER_DE_PIECES_REPOSITORY)
    private readonly dossiers: DossierDePiecesRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    userId: number,
    societeId: string,
    champs: ChampsBeneficiaire,
  ): Promise<BeneficiaireEffectifSnapshot[]> {
    // Répond « introuvable » à qui n'est pas le titulaire — un 403
    // confirmerait l'existence de l'identifiant.
    await this.getProfilPM.execute(userId, societeId);

    const registre = await this.registres.parSociete(societeId);

    // Peut lever : donnée refusée, ou capital dépassé. Rien n'est persisté.
    registre.declarer(champs);

    const enregistre = await this.registres.save(registre);

    // **Déclarer un bénéficiaire réclame une pièce d'identité de plus.** Le
    // dossier qui était complet ne l'est donc plus, et un KYB validé doit être
    // révoqué — sans quoi une société pourrait ajouter un actionnaire après sa
    // validation et continuer d'opérer sans que personne l'ait identifié.
    await this.annoncerLeDossier(societeId, userId, enregistre);

    // Le registre entier, et non la seule déclaration : le total des parts a
    // changé, et c'est l'écran que le titulaire relit.
    return enregistre.beneficiairesPublies;
  }

  /**
   * Le registre a changé, donc ce que le dossier de pièces doit réunir aussi.
   *
   * La liste vient du registre **tel qu'il vient d'être enregistré**, jamais de
   * celui d'avant : c'est le nouveau bénéficiaire dont la pièce manque.
   */
  private async annoncerLeDossier(
    societeId: string,
    userId: number,
    registre: RegistreDesBeneficiaires,
  ): Promise<void> {
    const dossier = await this.dossiers.parSociete(societeId);

    annoncerLaCompletude(
      this.eventBus,
      dossier,
      { id: societeId, utilisateurId: userId },
      registre.beneficiairesPublies.map((b) => b.id),
    );
  }
}
