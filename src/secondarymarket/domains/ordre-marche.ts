export enum OrdreMarcheSens {
  VENTE = 'vente',
  RACHAT_PLATEFORME = 'rachat_plateforme',
}

export enum OrdreMarcheStatus {
  EN_CARNET = 'en_carnet',
  MATCH_PROPOSE = 'match_propose',
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
  montant: number;
  prixUnitaire: number;
  statut: OrdreMarcheStatus;
  valideJusquAu: Date | null;
  createdAt: Date;
}
