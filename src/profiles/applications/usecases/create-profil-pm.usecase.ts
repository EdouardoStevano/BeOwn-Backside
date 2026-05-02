import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { CreateProfilPMDto } from '../../presenters/dto/profil.dto';

@Injectable()
export class CreateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY) private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPMDto): Promise<ProfilPM> {
    const existing = await this.profilRepository.findProfilPMByUserId(userId);
    if (existing) {
      return existing;
    }

    const profil = new ProfilPM();
    profil.utilisateurId = userId;
    Object.assign(profil, dto);
    return this.profilRepository.saveProfilPM(profil);
  }
}
