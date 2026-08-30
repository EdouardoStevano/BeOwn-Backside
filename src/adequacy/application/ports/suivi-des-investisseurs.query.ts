import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';

export const SUIVI_DES_INVESTISSEURS_QUERY = Symbol(
  'SUIVI_DES_INVESTISSEURS_QUERY',
);

/** Une ligne de la surveillance périodique. */
export interface ContactDu {
  investorId: number;
  niveauRisque: NiveauRisque | null;
  dernierContactAdmin: Date | null;
  prochainContactDu: Date | null;
}

/**
 * La campagne de contact périodique — PSFP art. 21.
 *
 * Port distinct de {@link ClassementDuTitulaireQuery} et non l'une de ses
 * méthodes : ce sont deux lectures sans rapport, l'une opposable à une
 * souscription, l'autre alimentant une campagne interne. Les réunir obligerait
 * l'entrée en relation — qui n'a besoin que de la première — à dépendre d'une
 * interface dont elle n'appellerait jamais la moitié (§40, ISP).
 *
 * C'est une **vraie projection** : elle filtre des colonnes, ne dérive rien, et
 * n'a aucune raison de reconstruire une racine par ligne (§11).
 */
export interface SuiviDesInvestisseursQuery {
  /** Titulaires dont le contact périodique est dû, les plus en retard d'abord. */
  contactsDus(limite: number): Promise<ContactDu[]>;
}
