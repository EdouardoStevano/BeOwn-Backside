/**
 * Paramètres du programme de parrainage, lus de l'environnement.
 *
 * Deux nombres, documentés dans `.env.example` :
 *  - `PARRAINAGE_TAUX_PCT` — pourcentage du premier investissement définitif
 *    versé à CHACUN des deux bénéficiaires (parrain et filleul) ;
 *  - `PARRAINAGE_PLAFOND_ANNUEL_EUR` — plafond de bonus par bénéficiaire et
 *    par année civile.
 *
 * Une valeur absente, non numérique ou négative retombe sur le défaut : ce
 * chemin crédite de l'argent ex nihilo, une configuration cassée doit donner
 * un programme aux conditions CONNUES, jamais un montant surprise. La lecture
 * se fait à chaque attribution (pas de copie en mémoire au bootstrap) : un
 * changement de taux s'applique au prochain bonus sans redémarrage — et
 * surtout, aucun état de processus (stateless).
 */
export interface ParrainageConfig {
  tauxPct: number;
  plafondAnnuelEur: number;
}

export const PARRAINAGE_TAUX_PCT_DEFAUT = 1;
export const PARRAINAGE_PLAFOND_ANNUEL_EUR_DEFAUT = 1500;

const lirePositif = (brut: string | undefined, defaut: number): number => {
  const valeur = Number(brut);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : defaut;
};

export function lireParrainageConfig(
  env: Record<string, string | undefined> = process.env,
): ParrainageConfig {
  return {
    tauxPct: lirePositif(env.PARRAINAGE_TAUX_PCT, PARRAINAGE_TAUX_PCT_DEFAUT),
    plafondAnnuelEur: lirePositif(
      env.PARRAINAGE_PLAFOND_ANNUEL_EUR,
      PARRAINAGE_PLAFOND_ANNUEL_EUR_DEFAUT,
    ),
  };
}
