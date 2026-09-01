export enum OrdreMarcheSens {
  VENTE = 'vente',
  RACHAT_PLATEFORME = 'rachat_plateforme',
}

export enum OrdreMarcheStatus {
  /** Annonce publiée sur le tableau d'affichage, sans intérêt exprimé. */
  EN_CARNET = 'en_carnet',
  /**
   * Un acheteur s'est manifesté. Art. 25 : la plateforme n'apparie rien — elle
   * transmet l'intérêt au vendeur, qui doit accepter pour qu'un contrat naisse.
   */
  INTERET_EXPRIME = 'interet_exprime',
  MATCH_PROPOSE = 'match_propose',
  /** Le vendeur a accepté : les parties peuvent contracter. */
  ACCEPTE = 'accepte',
  EXECUTE = 'execute',
  ANNULE = 'annule',
  EXPIRE = 'expire',
}

/**
 * Statuts sous lesquels une annonce IMMOBILISE encore ses fractions.
 *
 * Tant qu'une annonce peut aboutir à une cession, les fractions qu'elle porte
 * ne sont plus disponibles pour une seconde annonce : les recompter libres
 * autoriserait le vendeur à promettre deux fois les mêmes parts, et deux
 * règlements à s'exécuter sur un stock qui n'existe qu'une fois.
 *
 * `EXECUTE`, `ANNULE` et `EXPIRE` sont exclus : la cession est faite (les
 * fractions ont déjà quitté la position) ou définitivement abandonnée.
 */
export const STATUTS_ANNONCE_ENGAGEANTE: readonly OrdreMarcheStatus[] = [
  OrdreMarcheStatus.EN_CARNET,
  OrdreMarcheStatus.INTERET_EXPRIME,
  OrdreMarcheStatus.ACCEPTE,
];

export class OrdreMarche {
  id: string;
  investissementId: string;
  vendeurId: number;
  acheteurId: number | null;
  sens: OrdreMarcheSens;
  nbFractions: number;
  montant: number;
  prixUnitaire: number;
  statut: OrdreMarcheStatus;
  /** Quantité sur laquelle porte l'intérêt exprimé par l'acheteur. */
  interetNbFractions: number | null;
  /** Horodatage de l'expression d'intérêt, pour la piste d'audit. */
  interetExprimeLe: Date | null;
  valideJusquAu: Date | null;
  createdAt: Date;
}
