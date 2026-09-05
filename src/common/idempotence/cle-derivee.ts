import { createHash } from 'crypto';

/**
 * Fenêtre de regroupement d'une clé dérivée, en millisecondes.
 *
 * Trente secondes : très au-delà du double-clic et du renvoi automatique d'un
 * formulaire, très en deçà du délai qui sépare deux opérations réellement
 * voulues. Un utilisateur qui souhaite retirer deux fois le même montant peut
 * le faire — trente secondes plus tard.
 */
export const FENETRE_IDEMPOTENCE_MS = 30_000;

/**
 * Clé d'idempotence DÉTERMINISTE, dérivée du contenu de l'opération.
 *
 * Le repli était `randomUUID()` : une clé neuve à chaque appel, donc une
 * absence totale d'idempotence quand le client n'en fournissait pas. Deux
 * soumissions du même retrait — double-clic, renvoi de formulaire, reprise
 * réseau du navigateur — produisaient deux clés distinctes et DEUX retraits.
 * La contrainte d'unicité en base ne pouvait rien : on lui donnait deux
 * valeurs différentes pour la même intention.
 *
 * La clé est ici l'empreinte de ce qui définit l'opération — qui, quoi, vers
 * quoi, combien — plus le NUMÉRO DE FENÊTRE de trente secondes. Deux appels
 * identiques rapprochés tombent sur la même clé et la contrainte d'unicité
 * fait le reste ; deux opérations volontairement identiques mais espacées
 * tombent sur des clés distinctes et passent toutes les deux.
 *
 * Le montant entre dans l'empreinte EN CENTIMES ENTIERS : `100.10` et
 * `100.1` désignent la même somme et doivent produire la même clé.
 *
 * Ce n'est PAS un substitut à une clé fournie par le client, qui reste
 * préférable — elle couvre une fenêtre illimitée. C'est un filet pour les
 * appelants qui n'en envoient pas.
 */
export function deriverCleIdempotence(params: {
  /** Compte à l'origine de l'opération. */
  userId: number | string;
  /** Nature de l'opération : `retrait`, `souscription`, `versement-porteur`… */
  type: string;
  /** Ce que l'opération vise : portefeuille, projet, investissement. */
  cible: string;
  /** Montant en euros. */
  montant: number;
  /** Injectable pour les tests ; `Date.now()` par défaut. */
  maintenantMs?: number;
}): string {
  const fenetre = Math.floor(
    (params.maintenantMs ?? Date.now()) / FENETRE_IDEMPOTENCE_MS,
  );
  const centimes = Math.round(params.montant * 100);
  const empreinte = createHash('sha256')
    .update(
      [params.userId, params.type, params.cible, centimes, fenetre].join('|'),
    )
    .digest('hex');

  // Préfixé par le type : une clé d'audit doit se lire sans être déchiffrée.
  return `${params.type}:auto:${empreinte.slice(0, 32)}`;
}
