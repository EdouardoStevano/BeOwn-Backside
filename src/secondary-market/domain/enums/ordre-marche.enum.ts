/**
 * Le vocabulaire du carnet d'ordres (§4).
 *
 * Ce fichier portait aussi une classe `OrdreMarche` : douze champs publics,
 * aucun comportement, et aucun appelant — un modèle anémique (§7) que le
 * contrôleur contournait en manipulant directement les lignes ORM. L'agrégat
 * qui la remplace est `SecondaryMarketOrder`.
 */

/**
 * **Sens de l'ordre.** `RACHAT_PLATEFORME` est la reprise d'une position par
 * BeOwn elle-même, prévue par le cahier des charges comme filet de liquidité ;
 * seule la `VENTE` entre investisseurs est ouverte aujourd'hui.
 */
export enum OrdreMarcheSens {
  VENTE = 'vente',
  RACHAT_PLATEFORME = 'rachat_plateforme',
}

/**
 * **Cycle de vie d'un ordre.** `EN_CARNET` est le seul état depuis lequel un
 * ordre s'exécute, s'annule ou expire — c'est l'invariant que porte
 * `SecondaryMarketOrder`.
 *
 * > ⚠️ `MATCH_PROPOSE`, `ACCEPTE` et `EXPIRE` n'ont aucun code qui les pose.
 * > Les deux premiers décrivent un appariement négocié que le produit n'a
 * > jamais implémenté ; `EXPIRE` attend un CRON qui lirait `valideJusquAu`.
 * > Ne pas les traiter comme des états atteignables tant que rien ne les écrit.
 */
export enum OrdreMarcheStatus {
  EN_CARNET = 'en_carnet',
  MATCH_PROPOSE = 'match_propose',
  ACCEPTE = 'accepte',
  EXECUTE = 'execute',
  ANNULE = 'annule',
  EXPIRE = 'expire',
}
