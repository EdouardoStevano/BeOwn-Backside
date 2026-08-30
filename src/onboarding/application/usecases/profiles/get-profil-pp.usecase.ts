import { Inject, Injectable } from '@nestjs/common';
import {
  AVANCEMENT_DU_QUESTIONNAIRE_QUERY,
  type AvancementDuQuestionnaireQuery,
} from 'src/adequacy/application/ports/avancement-du-questionnaire.query';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/onboarding/domain/repositories/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/onboarding/domain/errors';
import { VueProfilPP, vueProfilPP } from '../../mappers/profil-pp-vue.mapper';

/**
 * Lecture du profil investisseur — personne physique.
 *
 * Deux lectures, une réponse : le dossier réglementaire d'un côté, l'état
 * civil et le numéro de l'autre, depuis que ceux-ci ont quitté `profil_pp`
 * pour le compte qui les portait déjà. La forme publiée ne change pas — voir
 * `vueProfilPP`.
 */
@Injectable()
export class GetProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    // Le classement est **lu par le port du contexte voisin**, jamais par son
    // repository : cet écran l'affiche, il ne le décide pas (§3, §11).
    @Inject(AVANCEMENT_DU_QUESTIONNAIRE_QUERY)
    private readonly profilsConformite: AvancementDuQuestionnaireQuery,
  ) {}

  async execute(userId: number): Promise<VueProfilPP> {
    const [profil, compte, conformite] = await Promise.all([
      this.profilPPRepository.findByUserId(userId),
      this.userRepository.findById(userId),
      this.profilsConformite.duTitulaire(userId),
    ]);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }
    return vueProfilPP(profil, compte, conformite.classement);
  }
}
