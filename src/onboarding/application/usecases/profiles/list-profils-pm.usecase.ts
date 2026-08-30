import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_PM_REPOSITORY,
  type ProfilPMRepository,
} from 'src/onboarding/domain/repositories/profil-pm.repository';
import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';

/**
 * Les sociétés déclarées par un compte.
 *
 * Remplace un `GetProfilPMUseCase` qui rendait *le* dossier moral du compte et
 * levait `ProfilPMIntrouvableError` en son absence. Les deux hypothèses sont
 * tombées ensemble : il peut y en avoir plusieurs, et n'en avoir aucune n'est
 * pas une erreur — c'est l'état de départ de tout compte, exactement comme
 * pour l'étape d'onboarding. Une liste vide se rend donc telle quelle, et le
 * front n'a plus à traiter un 404 comme un cas nominal.
 */
@Injectable()
export class ListProfilsPMUseCase {
  constructor(
    @Inject(PROFIL_PM_REPOSITORY)
    private readonly profilPMRepository: ProfilPMRepository,
  ) {}

  execute(userId: number): Promise<ProfilPM[]> {
    return this.profilPMRepository.listerParUtilisateur(userId);
  }
}
