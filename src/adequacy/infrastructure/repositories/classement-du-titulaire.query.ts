import { Injectable } from '@nestjs/common';
import type {
  ClassementDuTitulaire,
  ClassementDuTitulaireQuery,
} from 'src/adequacy/application/ports/classement-du-titulaire.query';
import type { EvaluationDAdequation } from 'src/adequacy/domain/aggregates/evaluation-d-adequation';
import { EvaluationDAdequationTypeOrmRepository } from './evaluation-d-adequation.repository';

/**
 * Le classement, lu par la **racine** plutôt que par une requête à plat.
 *
 * Délibéré : la catégorie et le plafond ne sont pas stockés tels quels, ils
 * sont calculés — `plafondConseille()` applique la formule PSFP au patrimoine
 * déclaré au questionnaire. Les recalculer ici en SQL les mettrait en double,
 * exactement ce que la copie sur `profil_pp` faisait avant la scission.
 */
@Injectable()
export class ClassementDuTitulaireTypeOrmQuery implements ClassementDuTitulaireQuery {
  constructor(
    private readonly evaluations: EvaluationDAdequationTypeOrmRepository,
  ) {}

  async duTitulaire(investorId: number): Promise<ClassementDuTitulaire> {
    return this.publier(await this.evaluations.parTitulaire(investorId));
  }

  async deLaSociete(
    investorId: number,
    societeId: string,
  ): Promise<ClassementDuTitulaire> {
    return this.publier(
      await this.evaluations.parSociete(investorId, societeId),
    );
  }

  private publier(evaluation: EvaluationDAdequation): ClassementDuTitulaire {
    const classement = evaluation.classement.toSnapshot();
    return {
      categoriePsfp: classement.categoriePsfp,
      estNonAverti: evaluation.estNonAverti(),
      plafondConseille: evaluation.plafondConseille(),
      patrimoineDeclare: classement.patrimoineDeclare,
    };
  }
}
