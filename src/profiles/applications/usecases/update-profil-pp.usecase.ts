import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { CreateProfilPPDto } from '../../presenters/dto/profil.dto';

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
      throw new NotFoundException('Profil PP non trouvé');
    }

    Object.assign(profil, dto);
    return this.profilRepository.updateProfilPP(profil);
  }
}
