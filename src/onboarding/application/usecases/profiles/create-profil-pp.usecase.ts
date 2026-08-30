import { Inject, Injectable } from '@nestjs/common';
import {
  AVANCEMENT_DU_QUESTIONNAIRE_QUERY,
  type AvancementDuQuestionnaireQuery,
} from 'src/adequacy/application/ports/avancement-du-questionnaire.query';
import { EventBus } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/onboarding/domain/repositories/profil-pp.repository';
import { CreateProfilPPDto } from 'src/onboarding/presentation/http/dto/profil.dto';
import { ProfilPPCreeDomainEvent } from 'src/onboarding/domain/events/profil-pp-cree.domain-event';
import { ProfilPPFactory } from 'src/onboarding/domain/factories/profil-pp.factory';
import { ProfilPPDejaExistantError } from 'src/onboarding/domain/errors';
import { champsDeclaresDepuisDto } from '../../mappers/profil-pp-champs.mapper';
import { VueProfilPP, vueProfilPP } from '../../mappers/profil-pp-vue.mapper';

/**
 * Complétion du profil investisseur — personne physique.
 *
 * Ce use case n'orchestre que des accès (§6 — Application Service) : vérifier
 * l'unicité, faire naître l'agrégat, le persister, annoncer le fait, et
 * recomposer la vue rendue au front. La validité des données déclarées et le
 * classement PSFP initial vivent dans `ProfilPPFactory.creer`.
 *
 * **Le formulaire alimente deux propriétaires**, et ce use case n'en écrit
 * qu'un. Le téléphone qu'il porte appartient au compte, comme le prénom et le
 * nom ; il est reporté par `ProfilPPCreeEventHandler`, abonné au fait levé ici
 * (§8). Compléter son dossier et tenir à jour ses coordonnées sont deux
 * sujets : le second ne conditionne pas le premier, et l'échouer ne doit pas
 * défaire un profil déjà enregistré.
 *
 * Le compte reste lu — jamais écrit — parce que la **réponse** publie son état
 * civil : `prenom` et `nom` ont quitté `profil_pp`, et les retirer du JSON
 * casserait l'écran de profil (voir `vueProfilPP`).
 *
 * **Remplir son dossier personnel n'engage plus la nature du compte.** Ce use
 * case déclarait le compte « personne physique », ce qui lui interdisait
 * ensuite de déclarer une société. Le cahier des charges dit l'inverse : un
 * compte a un dossier physique **et** autant de sociétés qu'il en représente,
 * et c'est ce qui lui évite « de compléter les informations redondantes » —
 * l'identité saisie ici est celle du représentant légal de chacune d'elles.
 * Voir `ProfilsPPEtPMCoexistent1784100000000`.
 */
@Injectable()
export class CreateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    // Port du contexte IAM, et non son entité ORM : le profil a besoin de
    // l'identité du compte, pas de savoir dans quelle table elle est rangée
    // (§12.3).
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    // Le classement est **lu par le port du contexte voisin**, jamais par son
    // repository : cet écran l'affiche, il ne le décide pas (§3, §11).
    @Inject(AVANCEMENT_DU_QUESTIONNAIRE_QUERY)
    private readonly profilsConformite: AvancementDuQuestionnaireQuery,
    private readonly eventBus: EventBus,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<VueProfilPP> {
    const existing = await this.profilPPRepository.findByUserId(userId);
    if (existing) throw new ProfilPPDejaExistantError();

    const naissant = ProfilPPFactory.creer({
      userId,
      ...champsDeclaresDepuisDto(dto),
    });

    const profil = await this.profilPPRepository.save(naissant);

    // Le fait est annoncé, les réactions ne sont pas orchestrées ici (§8).
    // Publié après la sauvegarde uniquement — un abonné ne doit pas réagir à un
    // profil qui n'existe pas.
    this.eventBus.publish(new ProfilPPCreeDomainEvent(userId));

    const [compte, conformite] = await Promise.all([
      this.userRepository.findById(userId),
      // Le classement se lit sur la racine, et non sur le profil qui vient de
      // naître : rien n'oblige le titulaire à remplir son dossier avant de
      // répondre au questionnaire, et l'ordre inverse se produit.
      this.profilsConformite.duTitulaire(userId),
    ]);

    return vueProfilPP(profil, compte, conformite.classement);
  }
}
