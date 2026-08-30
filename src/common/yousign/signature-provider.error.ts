/**
 * Indisponibilité du prestataire de signature — distincte d'une faute d'appel.
 *
 * Deux familles d'échecs se cachaient jusqu'ici derrière la même `Error`, et
 * donc derrière le même 500 :
 *
 *  - le prestataire ne peut pas nous servir (panne, abonnement ou période
 *    d'essai expirés, clé refusée, quota atteint, délai dépassé, réseau
 *    coupé) — RIEN n'est fautif chez nous, l'appel a vocation à réussir plus
 *    tard, tel quel ;
 *  - notre appel est mal formé (document refusé, champ invalide, ressource
 *    inexistante) — réessayer à l'identique ne changera rien.
 *
 * Seule la première famille lève `SignatureProviderUnavailableError`. La
 * seconde continue de lever une `Error` nue : son traitement — et donc son
 * statut HTTP — reste rigoureusement inchangé.
 *
 * Cette erreur est volontairement SANS dépendance à HTTP : l'adaptateur
 * YouSign ignore qu'il existe une API REST au-dessus de lui. La traduction en
 * réponse (503 + code stable) est décidée dans la couche presenters, en un
 * seul endroit.
 */

/** Code métier stable publié au client. Le front branche son message dessus. */
export const SIGNATURE_PROVIDER_UNAVAILABLE = 'SIGNATURE_PROVIDER_UNAVAILABLE';

/**
 * Pourquoi le prestataire ne nous sert pas. Valeurs BORNÉES : elles servent
 * d'étiquette de log et de métrique, jamais de texte affiché à l'utilisateur.
 */
export type MotifIndisponibilite =
  | 'authentification_refusee'
  | 'abonnement_ou_quota'
  | 'panne'
  | 'delai_depasse'
  | 'reseau';

/**
 * Motif d'indisponibilité déduit du statut HTTP renvoyé par le prestataire,
 * ou `null` si le statut désigne une faute de notre appel.
 *
 * Le 401 est ici traité comme une indisponibilité, et non comme un bug : une
 * clé valide hier qui ne l'est plus aujourd'hui (abonnement échu, essai
 * terminé, clé révoquée) ne se corrige pas en changeant une ligne de code, et
 * l'utilisateur n'a rien fait de mal. Le 403 suit la même logique.
 */
export function motifIndisponibilite(
  statutFournisseur: number,
): MotifIndisponibilite | null {
  if (statutFournisseur === 401 || statutFournisseur === 403) {
    return 'authentification_refusee';
  }
  if (statutFournisseur === 402 || statutFournisseur === 429) {
    return 'abonnement_ou_quota';
  }
  if (statutFournisseur === 408 || statutFournisseur === 504) {
    return 'delai_depasse';
  }
  if (statutFournisseur >= 500) return 'panne';
  return null;
}

export class SignatureProviderUnavailableError extends Error {
  readonly code = SIGNATURE_PROVIDER_UNAVAILABLE;
  /** Appel concerné, en clair : `POST /signature_requests`. Log uniquement. */
  readonly operation: string;
  readonly motif: MotifIndisponibilite;
  /** Statut HTTP du prestataire, absent si l'appel n'a jamais abouti. */
  readonly statutFournisseur?: number;
  /**
   * Réponse brute du prestataire. Destinée au JOURNAL SERVEUR et à lui seul :
   * elle nomme le compte, l'abonnement, parfois l'identité du signataire. Elle
   * ne doit jamais traverser la frontière HTTP.
   */
  readonly detailFournisseur?: string;

  constructor(params: {
    operation: string;
    motif: MotifIndisponibilite;
    statutFournisseur?: number;
    detailFournisseur?: string;
  }) {
    const suffixeStatut = params.statutFournisseur
      ? ` — statut ${params.statutFournisseur}`
      : '';
    super(
      `Prestataire de signature indisponible (${params.motif}) sur ${params.operation}${suffixeStatut}`,
    );
    this.name = 'SignatureProviderUnavailableError';
    this.operation = params.operation;
    this.motif = params.motif;
    this.statutFournisseur = params.statutFournisseur;
    this.detailFournisseur = params.detailFournisseur;
  }
}

/** `true` si l'échec vient du prestataire et non de notre appel. */
export const estIndisponibiliteFournisseur = (
  valeur: unknown,
): valeur is SignatureProviderUnavailableError =>
  valeur instanceof SignatureProviderUnavailableError;
