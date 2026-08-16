import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/profiles/domains/ports/profil-pm.repository';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { CreateProfilPMDto } from '../../presenters/dto/profil.dto';

@Injectable()
export class CreateProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  async execute(userId: number, dto: CreateProfilPMDto): Promise<ProfilPM> {
    const existing = await this.profilPMRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const profil = new ProfilPM();
    profil.utilisateurId = userId;
    Object.assign(profil, dto);
    return this.profilPMRepository.save(profil);
  }
}
