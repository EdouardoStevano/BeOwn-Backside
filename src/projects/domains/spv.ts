import { RegimeFiscal } from './enums/regime-fiscal.enum';

/**
 * Société de Projet — entité légale propriétaire d'un projet immobilier.
 * Pour les projets equity-locatif, c'est une SCI dédiée par projet qui
 * détient le bien, signe les baux, encaisse les loyers, paye les charges.
 *
 * Champs hérités (rétrocompat) : siren, forme, siegeAdresse, iban, capitalSocial.
 * Champs equity-locatif (ajoutés en Phase 1) : dateConstitution, statutsPdfUrl,
 * regimeFiscal (default IS), gestionnaireUserId.
 *
 * Note : `siren` reste le nom du champ même si la valeur peut être un SIREN (FR)
 * ou un RCCM (UEMOA) selon la juridiction.
 */
export class Spv {
  id: string;
  raisonSociale: string;
  siren: string | null;
  forme: string | null;            // ex. 'SCI', 'SARL', 'SAS'
  capitalSocial: number | null;
  siegeAdresse: string | null;
  iban: string | null;

  // Champs equity-locatif
  dateConstitution: Date | null;
  statutsPdfUrl: string | null;
  regimeFiscal: RegimeFiscal;      // default IS
  gestionnaireUserId: number | null;

  createdAt: Date;
  updatedAt: Date;
}
