import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/iam/domain/repositories/profil-pp.repository';
import { CreateProfilPPDto } from 'src/iam/presentation/http/dto/profil.dto';
import { ProfilPPCreeDomainEvent } from 'src/iam/domain/events/profil-pp-cree.domain-event';
import { ProfilPPFactory } from 'src/iam/domain/factories/profil-pp.factory';
import { ProfilPPDejaExistantError } from 'src/iam/domain/errors';
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
    private readonly eventBus: EventBus,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<VueProfilPP> {
    const existing = await this.profilPPRepository.findByUserId(userId);
    if (existing) throw new ProfilPPDejaExistantError();

    const profil = await this.profilPPRepository.save(
      ProfilPPFactory.creer({
        utilisateurId: userId,
        ...champsDeclaresDepuisDto(dto),
      }),
    );

    // Le fait est annoncé, les réactions ne sont pas orchestrées ici (§8).
    // Publié après la sauvegarde uniquement — un abonné ne doit pas réagir à un
    // profil qui n'existe pas.
    this.eventBus.publish(new ProfilPPCreeDomainEvent(userId, dto.telephone));

    const compte = await this.userRepository.findById(userId);

    return {
      ...vueProfilPP(profil, compte),
      // Le numéro **déclaré** prime dans la réponse : le report sur le compte
      // est différé, et relire la colonne ici rendrait l'ancien numéro à qui
      // vient d'en saisir un nouveau. C'est ce que le titulaire a soumis, et
      // ce que le compte portera.
      telephone: dto.telephone ?? compte?.telephone ?? null,
    };
  }
}
