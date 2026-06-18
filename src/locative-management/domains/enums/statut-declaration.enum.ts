/**
 * Cycle de vie d'une déclaration (loyer encaissé ou charge) faite par le porteur,
 * validée par l'admin avant intégration dans le moteur de distribution.
 */
export enum StatutDeclaration {
  DECLARE = 'declare',
  VALIDE = 'valide',
  REJETE = 'rejete',
}
