import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/compliance/domain/errors';
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
  ) {}

  async execute(userId: number): Promise<VueProfilPP> {
    const [profil, compte] = await Promise.all([
      this.profilPPRepository.findByUserId(userId),
      this.userRepository.findById(userId),
    ]);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }
    return vueProfilPP(profil, compte);
  }
}
