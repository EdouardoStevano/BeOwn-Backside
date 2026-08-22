import type { RepaymentSchedule } from '../aggregates/repayment-schedule';

export const REPAYMENT_SCHEDULE_REPOSITORY = Symbol(
  'REPAYMENT_SCHEDULE_REPOSITORY',
);

/**
 * La collection des échéanciers (§10) — orientée agrégat, pas table.
 *
 * Ce port remplace trois méthodes qui vivaient sur `InvestmentRepository`,
 * dans `subscription` : `findEcheancesByInvestissement`, `saveEcheances` et
 * `deleteEcheancesByInvestissementId`. Un repository d'investissements y
 * servait la collection d'un autre contexte, en rendant des entités nues (§10).
 * Les deux méthodes d'écriture n'avaient plus aucun appelant — la souscription
 * persiste ses échéances par l'`EntityManager` de sa propre transaction — et
 * disparaissent plutôt que de déménager : une abstraction sans responsabilité
 * n'a pas à exister (§43).
 *
 * Il n'expose donc que la lecture. Les écritures reviendront avec leur
 * intention métier — régénérer un échéancier sur un capital complété,
 * qualifier les retards — et non sous la forme d'un `save` générique.
 */
export interface RepaymentScheduleRepository {
  /**
   * L'échéancier d'un investissement. Rend un agrégat **vide** plutôt que
   * `null` quand aucune échéance n'existe : un investissement dont
   * l'échéancier n'a pas encore été généré a bien un échéancier, il est vide.
   * L'appelant n'a pas à distinguer les deux cas.
   */
  findByInvestissement(investissementId: string): Promise<RepaymentSchedule>;
}
