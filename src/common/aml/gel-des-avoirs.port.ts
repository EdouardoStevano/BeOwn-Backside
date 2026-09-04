/**
 * Port de la garde « avoirs gelés » (DIP) — abstract class servant de contrat
 * ET de token d'injection (convention du repo). Les cas d'usage d'argent
 * sortant dépendent de CE port, jamais du service concret ni de l'ORM.
 *
 * ISP : les consommateurs des chemins d'argent n'ont besoin QUE de la
 * vérification — la pose/levée du gel (écriture) reste sur le service concret,
 * réservé au contrôleur admin compliance du même module.
 */
export abstract class GelDesAvoirsPort {
  /**
   * Lève `ForbiddenException` (403, code stable `AVOIRS_GELES`, message
   * neutre unique) si les avoirs de l'utilisateur sont gelés. No-op sinon.
   * À appeler EN PREMIER dans chaque chemin d'argent sortant : dépôt,
   * souscription, retrait, achat au marché secondaire.
   */
  abstract assertAvoirsNonGeles(userId: number): Promise<void>;
}
