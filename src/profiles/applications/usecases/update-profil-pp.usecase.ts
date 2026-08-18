import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/profiles/domains/errors';
import { CreateProfilPPDto } from '../../presenters/dto/profil.dto';
import { champsDeclaresDepuisDto } from '../mappers/profil-pp-champs.mapper';
import { VueProfilPP, vueProfilPP } from '../mappers/profil-pp-vue.mapper';

/**
 * Mise à jour du profil investisseur — personne physique.
 *
 * Le `Object.assign(profil, dto)` qui tenait lieu de mise à jour recopiait le
 * DTO champ pour champ, sans validation ni conversion : la date de naissance
 * y entrait sous forme de chaîne dans un champ typé `Date`, et un pays
 * inexistant écrasait un pays correct. `mettreAJour` soumet chaque champ aux
 * mêmes règles qu'à la création.
 */
@Injectable()
export class UpdateProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(
    userId: number,
    dto: Partial<CreateProfilPPDto>,
  ): Promise<VueProfilPP> {
    const profil = await this.profilPPRepository.findByUserId(userId);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }

    profil.mettreAJour(champsDeclaresDepuisDto(dto));
    const misAJour = await this.profilPPRepository.update(profil);

    const compte = await this.enregistrerTelephone(userId, dto.telephone);

    return vueProfilPP(misAJour, compte);
  }

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
