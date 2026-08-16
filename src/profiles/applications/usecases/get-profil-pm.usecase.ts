import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/profiles/domains/ports/profil-pm.repository';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { ProfilPMIntrouvableError } from 'src/profiles/domains/errors';

/**
 * Détail du profil investisseur — personne morale.
 *
 * Pendant de `GetProfilPPUseCase` : jusqu'ici le profil moral n'était lisible
 * qu'incidemment, noyé dans la réponse de `GET /users/me`. Un écran qui ne veut
 * que la fiche société devait donc charger le compte, le KYC, les documents et
 * le wallet pour en extraire un objet.
 */
@Injectable()
export class GetProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  async execute(userId: number): Promise<ProfilPM> {
    const profil = await this.profilPMRepository.findByUserId(userId);
    if (!profil) {
      throw new ProfilPMIntrouvableError();
    }
    return profil;
  }
}
