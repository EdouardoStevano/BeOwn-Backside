import { Inject, Injectable } from '@nestjs/common';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { EventBus } from '@nestjs/cqrs';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import { CreateProfilPPDto } from 'src/compliance/presentation/http/dto/profil.dto';
import { ProfilPPCreeDomainEvent } from 'src/compliance/domain/events/profil-pp-cree.domain-event';
import {
  NATURE_DU_DOSSIER_REPOSITORY,
  type NatureDuDossierRepository,
} from 'src/compliance/domain/repositories/nature-du-dossier.repository';
import { NatureDeDossier } from 'src/compliance/domain/enums/nature-de-dossier.enum';
import { ProfilPPFactory } from 'src/compliance/domain/factories/profil-pp.factory';
import {
  NatureDeDossierIncompatibleError,
  ProfilPPDejaExistantError,
} from 'src/compliance/domain/errors';
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
    @Inject(NATURE_DU_DOSSIER_REPOSITORY)
    private readonly natureDuDossier: NatureDuDossierRepository,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profilsConformite: InvestorComplianceProfileRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(userId: number, dto: CreateProfilPPDto): Promise<VueProfilPP> {
    const existing = await this.profilPPRepository.findByUserId(userId);
    if (existing) throw new ProfilPPDejaExistantError();

    const naissant = ProfilPPFactory.creer({
      userId,
      ...champsDeclaresDepuisDto(dto),
    });

    // Après la fabrique, avant l'écriture : un formulaire refusé ne doit pas
    // fixer la nature du compte, et rien ne doit être écrit si elle est déjà
    // fixée à l'autre. L'appel pose la nature ou rend celle qui fait foi — il
    // n'y a pas de fenêtre entre lire et écrire (§13).
    const nature = await this.natureDuDossier.declarer(
      userId,
      NatureDeDossier.PP,
    );
    if (nature !== NatureDeDossier.PP) {
      throw new NatureDeDossierIncompatibleError(NatureDeDossier.PP, nature);
    }

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
      this.profilsConformite.findByInvestorId(userId),
    ]);

    return vueProfilPP(profil, compte, conformite.classement);
  }
}
