export const PORTEFEUILLE_INVESTISSEUR = Symbol('PORTEFEUILLE_INVESTISSEUR');

/** Ce qu'un titulaire pèse, vu du contexte des souscriptions. */
export interface ResumePortefeuille {
  /** Nombre de souscriptions vivantes — annulées et rétractées exclues. */
  nbInvestissements: number;
  /** Encours sous gestion, arrondi au centime. */
  encours: number;
}

/**
 * Ce que le contexte des souscriptions sait dire d'un portefeuille, et rien de
 * plus.
 *
 * `identity` a besoin de ces deux nombres pour une seule chose : afficher à un
 * conseiller le poids de ses clients. Il n'a pas à savoir ce qu'est une
 * souscription, ni quels statuts comptent — c'est le contrat qui le dit.
 *
 * `CgpController` les calculait lui-même : il injectait
 * `Repository<InvestmentEntity>`, écrivait la liste des statuts vivants dans
 * une clause SQL (`NOT IN ('ANNULE', 'RETRACTE')`) et sommait à la main. Un
 * statut ajouté au contexte des souscriptions faussait donc silencieusement
 * l'encours affiché aux conseillers, sans que personne de ce côté-là ne puisse
 * le voir — c'est précisément ce qu'une Anti-Corruption Layer évite (§20).
 */
export interface PortefeuilleInvestisseur {
  /**
   * Résumé par titulaire, indexé par identifiant.
   *
   * Les titulaires sans aucune souscription sont **absents** de la table —
   * l'appelant décide si cela vaut zéro ou « inconnu ».
   */
  resumerPour(
    utilisateurIds: number[],
  ): Promise<Map<number, ResumePortefeuille>>;
}
