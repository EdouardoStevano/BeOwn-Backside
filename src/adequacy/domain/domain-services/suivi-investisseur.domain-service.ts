import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';

/**
 * Mois entre deux prises de contact, selon le niveau de risque.
 *
 * Plus l'investisseur est exposé, plus la relation est reprise souvent : c'est
 * l'obligation de suivi de la clientèle, et le calendrier qui la matérialise.
 * Le `Record` remplace un ternaire imbriqué où le niveau inconnu retombait
 * silencieusement sur douze mois — c'est-à-dire sur le suivi le plus lâche, le
 * mauvais côté pour se tromper.
 */
const CADENCE_MOIS: Record<NiveauRisque, number> = {
  [NiveauRisque.VULNERABLE]: 3,
  [NiveauRisque.MODERE]: 6,
  [NiveauRisque.QUALIFIE]: 12,
};

/**
 * Calendrier de suivi de l'investisseur.
 *
 * Fonction pure dans `domain/services/` : elle ne dépend que du niveau de
 * risque, n'appartient à aucun agrégat en particulier, et vivait jusqu'ici dans
 * `RiskScoringService`, entre deux appels de repository (§6).
 */
export function prochainContactApres(
  niveau: NiveauRisque,
  depuis: Date = new Date(),
): Date {
  const prochain = new Date(depuis);
  prochain.setMonth(prochain.getMonth() + CADENCE_MOIS[niveau]);
  return prochain;
}
