/**
 * Détermine le moteur économique appliqué au projet :
 * - OBLIGATAIRE : prêt in-fine à taux fixe (ancien modèle, conservé pour rétrocompat)
 * - EQUITY     : SCI dédiée, distribution variable sur loyers réels
 */
export enum ModeleEconomique {
  OBLIGATAIRE = 'obligataire',
  EQUITY = 'equity',
}
