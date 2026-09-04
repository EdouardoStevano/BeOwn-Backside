/**
 * Port du screening de la liste interne de gel (DIP) — consommé par la
 * machine à états KYC (profiles) au passage VALIDE, sans que la couche
 * application de profiles ne connaisse l'implémentation ni l'ORM.
 *
 * Le screening SIGNALE (alerte compliance), il ne gèle jamais seul.
 */
export abstract class SanctionsScreeningPort {
  /**
   * Contrôle l'identité d'un utilisateur contre la liste interne active.
   * Crée une alerte compliance par correspondance. Ne lève jamais vers
   * l'appelant (best-effort) : un incident de screening ne doit pas faire
   * échouer la validation KYC. Retourne le nombre de correspondances.
   */
  abstract screenUser(userId: number): Promise<number>;

  /**
   * Re-scan global : contrôle tous les comptes de la plateforme contre la
   * liste active (déclenché par l'admin compliance après mise à jour de la
   * liste). Retourne les volumes pour affichage.
   */
  abstract rescanTous(): Promise<{ scannes: number; correspondances: number }>;
}
