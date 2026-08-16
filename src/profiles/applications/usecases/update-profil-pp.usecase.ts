import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPPIntrouvableError } from 'src/profiles/domains/errors';
import { CreateProfilPPDto } from '../../presenters/dto/profil.dto';
import { champsDeclaresDepuisDto } from '../mappers/profil-pp-champs.mapper';

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
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(
    userId: number,
    dto: Partial<CreateProfilPPDto>,
  ): Promise<ProfilPP> {
    const profil = await this.profilRepository.findProfilPPByUserId(userId);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }

    profil.mettreAJour(champsDeclaresDepuisDto(dto));
    return this.profilRepository.updateProfilPP(profil);
  }
}
