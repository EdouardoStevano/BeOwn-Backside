import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/onboarding/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';
import { ProfilPMIntrouvableError } from 'src/onboarding/domain/errors';

/**
 * Une société précise, dont on vérifie qu'elle appartient bien au demandeur.
 *
 * Le contrôle d'appartenance est né avec le pluriel : tant qu'un compte n'avait
 * qu'un dossier moral, on le retrouvait *par* le compte, et la question ne se
 * posait pas. On le désigne désormais par son identité, qui ne dit rien de son
 * propriétaire — sans ce contrôle, l'uuid d'une société suffirait à lire la
 * fiche de quelqu'un d'autre.
 *
 * `ProfilPMIntrouvableError` et non une erreur d'autorisation : un 403
 * confirmerait au demandeur que l'identifiant existe. Pour qui n'en est pas le
 * titulaire, ce dossier n'existe pas.
 */
@Injectable()
export class GetProfilPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  async execute(userId: number, profilPMId: string): Promise<ProfilPM> {
    const profil = await this.profilPMRepository.findById(profilPMId);
    if (!profil || profil.userId !== userId) {
      throw new ProfilPMIntrouvableError();
    }
    return profil;
  }
}
