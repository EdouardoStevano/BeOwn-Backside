import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_REPOSITORY,
  type ProfilRepository,
} from '../ports/repositories/profil.repository';
import { ProfilPPIntrouvableError } from 'src/profiles/domains/errors';

@Injectable()
export class GetProfilPPUseCase {
  constructor(
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
  ) {}

  async execute(userId: number) {
    const profil = await this.profilRepository.findProfilPPByUserId(userId);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }
    return profil;
  }
}
