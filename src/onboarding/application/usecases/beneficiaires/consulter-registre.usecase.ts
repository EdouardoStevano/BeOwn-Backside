import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
  type RegistreDesBeneficiairesRepository,
} from 'src/onboarding/domain/repositories/registre-des-beneficiaires.repository';
import { BeneficiaireEffectifSnapshot } from 'src/onboarding/domain/entities/beneficiaire-effectif';
import { GetProfilPMUseCase } from '../profiles/get-profil-pm.usecase';

/** Le registre tel que le titulaire le relit. */
export interface VueRegistreDesBeneficiaires {
  societeId: string;
  beneficiaires: BeneficiaireEffectifSnapshot[];
  /**
   * Somme des parts détenues en direct.
   *
   * Publiée parce que c'est la seule chose que le titulaire ne peut pas
   * additionner de tête sans se tromper — et parce qu'elle explique le refus
   * qu'il obtiendra s'il déclare une part de trop. Les indirectes en sont
   * exclues : elles se superposent et ne se partagent pas le capital.
   */
  totalDetentionDirecte: number;
}

/**
 * Les bénéficiaires effectifs déclarés par une société.
 *
 * Le contrôleur faisait `beneficiaireRepo.find({ where: { profilPMId } })` et
 * rendait les lignes ORM telles quelles — donc la forme de la table, colonnes
 * mortes comprises. Il rend désormais des instantanés du domaine, et le total
 * des parts directes avec.
 */
@Injectable()
export class ConsulterRegistreUseCase {
  constructor(
    @Inject(REGISTRE_DES_BENEFICIAIRES_REPOSITORY)
    private readonly registres: RegistreDesBeneficiairesRepository,
    private readonly getProfilPM: GetProfilPMUseCase,
  ) {}

  async execute(
    userId: number,
    societeId: string,
  ): Promise<VueRegistreDesBeneficiaires> {
    await this.getProfilPM.execute(userId, societeId);

    const registre = await this.registres.parSociete(societeId);

    return {
      societeId,
      beneficiaires: registre.beneficiairesPublies,
      totalDetentionDirecte: registre.totalDetentionDirecte(),
    };
  }
}
