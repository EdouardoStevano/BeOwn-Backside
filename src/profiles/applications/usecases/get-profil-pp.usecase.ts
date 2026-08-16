import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import { ProfilPPIntrouvableError } from 'src/profiles/domains/errors';

@Injectable()
export class GetProfilPPUseCase {
  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
  ) {}

  async execute(userId: number) {
    const profil = await this.profilPPRepository.findByUserId(userId);
    if (!profil) {
      throw new ProfilPPIntrouvableError();
    }
    return profil;
  }
}
