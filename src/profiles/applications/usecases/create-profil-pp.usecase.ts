import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';
import { ProfilPPFactory } from 'src/profiles/domains/factories/profil-pp.factory';
import { ProfilPPDejaExistantError } from 'src/profiles/domains/errors';
import { champsDeclaresDepuisDto } from '../mappers/profil-pp-champs.mapper';
import { VueProfilPP, vueProfilPP } from '../mappers/profil-pp-vue.mapper';

/**
 * Complétion du profil investisseur — personne physique.
 *
 * Ce use case n'orchestre que des accès (§6 — Application Service) : vérifier
 * l'unicité, faire naître l'agrégat, le persister, et recomposer la vue rendue
 * au front. La validité des données déclarées et le classement PSFP initial
 * vivent dans `ProfilPPFactory.creer`.
 *
 * **Le formulaire alimente deux propriétaires.** Le téléphone qu'il porte
 * appartient au compte, comme le prénom et le nom : il est donc écrit par le
 * port d'IAM, et non déposé dans le dossier. C'est la seule chose qui empêche
 * la duplication de revenir par la porte du DTO.
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

    const compte = await this.enregistrerTelephone(userId, dto.telephone);

    return vueProfilPP(profil, compte);
  }

  /**
   * Le numéro déclaré au formulaire va sur le compte. Écrit après le dossier :
   * un profil sauvegardé sans numéro reste corrigeable par la route de mise à
   * jour, alors qu'un numéro posé sur un profil qui échoue ensuite laisserait
   * le compte modifié sans que rien ne l'ait demandé.
   */
  private async enregistrerTelephone(
    userId: number,
    telephone: string | undefined,
  ) {
    const compte = await this.userRepository.findById(userId);
    if (!compte) return null;

    if (!compte.changerTelephone(telephone)) return compte;

    return this.userRepository.update(compte);
  }
}
