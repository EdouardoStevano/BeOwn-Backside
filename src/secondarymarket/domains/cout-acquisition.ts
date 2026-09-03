import { round2 } from 'src/common/platform-fees/platform-fees.constants';

/**
 * Coût d'acquisition des fractions vendues sur le marché secondaire —
 * base de calcul de la plus-value du vendeur (frais `gain_revente_actions`).
 *
 * Méthode : coût moyen pondéré tel que le modèle le trace.
 *   coût unitaire = investissement.montant / investissement.nbTitres
 *
 * - Achat primaire pur : montant/nbTitres = prix de souscription → exact.
 * - Achats secondaires fusionnés : les fusions cumulent montant et nbTitres
 *   au prix d'achat → moyenne pondérée des coûts → exact.
 * - Vente partielle antérieure : le règlement décrémente `montant` du COÛT
 *   D'ACQUISITION des parts cédées (et non de leur prix de vente — voir
 *   yousign-webhook étape 5). Le rapport montant/nbTitres reste donc
 *   rigoureusement égal au coût moyen d'origine après une cession partielle :
 *   c'est ce qui rend la plus-value de la vente SUIVANTE juste.
 *   Décrémenter du prix de vente déplaçait le coût moyen à chaque cession —
 *   à la hausse sur une moins-value, à la baisse sur une plus-value — et
 *   faussait durablement l'assiette des frais sur gain.
 *
 * Fallbacks :
 * - nbTitres absent/0 → valeurTitre (prix unitaire d'origine) si présent ;
 * - sinon coût = prix de vente → plus-value nulle → pas de frais sur gain
 *   (on ne facture jamais un gain qu'on ne sait pas mesurer).
 */
export interface AcquisitionSource {
  montant: number | null;
  nbTitres: number | null;
  valeurTitre: number | null;
}

export const computeCoutAcquisition = (
  investissement: AcquisitionSource,
  nbFractionsVendues: number,
  prixUnitaireVente: number,
): number => {
  const nbTitres = Number(investissement.nbTitres);
  const montant = Number(investissement.montant);
  if (
    Number.isFinite(nbTitres) &&
    nbTitres > 0 &&
    Number.isFinite(montant) &&
    montant > 0
  ) {
    return round2((montant / nbTitres) * nbFractionsVendues);
  }
  const valeurTitre = Number(investissement.valeurTitre);
  if (Number.isFinite(valeurTitre) && valeurTitre > 0) {
    return round2(valeurTitre * nbFractionsVendues);
  }
  return round2(prixUnitaireVente * nbFractionsVendues);
};
