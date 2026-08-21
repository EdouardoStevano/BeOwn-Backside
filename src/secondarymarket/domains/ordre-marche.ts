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
