/**
 * Statut d'une attribution de bonus de parrainage.
 *
 * Une attribution existe dès que le premier investissement définitif du
 * filleul est constaté — même si les deux bonus sont réduits à zéro par le
 * plafond annuel : c'est elle qui marque « ce filleul a consommé son
 * parrainage », et cette marque doit exister indépendamment des montants.
 */
export enum StatutAttributionParrainage {
  /** Les deux bonus théoriques ont été crédités en entier. */
  CREDITEE = 'creditee',
  /** Au moins un des deux bonus a été réduit (voire annulé) par le plafond annuel. */
  PLAFONNEE = 'plafonnee',
}
