import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';

@Injectable()
export class SaveQuestionnaireUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number, categoriePsfp: CategoriePsfp): Promise<ProfilPP> {
    const profil = await this.profilRepository.findProfilPPByUserId(userId);
    if (!profil) {
      throw new NotFoundException('Profil PP non trouvé');
    }

    profil.categoriePsfp = categoriePsfp;
    return this.profilRepository.updateProfilPP(profil);
  }
}
