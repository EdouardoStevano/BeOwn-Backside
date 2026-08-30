import { ProjectStatus } from './enums/project-status.enum';

/**
 * Statuts de projet depuis lesquels une cession du bien peut être déclarée.
 *
 * Le bien doit exister et appartenir à la société support — donc la collecte
 * doit être terminée et financée. Il peut ensuite être cédé :
 *
 *  - `finance` : collecte bouclée, acquisition faite, mise en location pas
 *    encore effective (revente avant exploitation, opportunité, arbitrage) ;
 *  - `en_exploitation` : cas NOMINAL — un bien loué est cédé en cours de bail.
 *    C'est l'état dans lequel se trouve tout projet arrivé au terme de sa
 *    période de détention, et le seul que le cycle de vie prévoit avant
 *    `cloture`.
 *
 * Tous les autres statuts sont refusés, et pour des raisons distinctes :
 * avant `finance` il n'y a pas de bien à céder ; `cloture` signifie que la
 * sortie a déjà été exécutée et distribuée ; `echec` et `annule` ferment
 * l'opération sans acquisition.
 */
export const STATUTS_PROJET_CESSIBLES: ProjectStatus[] = [
  ProjectStatus.FINANCE,
  ProjectStatus.EN_EXPLOITATION,
];

export enum StatutSortie {
  PROJETEE = 'projetee', // vente envisagée mais non actée
  ACTEE = 'actee', // acte de vente signé, prix encaissé
  DISTRIBUEE = 'distribuee', // capital + plus-value versés aux investisseurs
  ANNULEE = 'annulee',
}

/**
 * Événement de sortie (vente du bien) pour un projet equity.
 *
 * Invariants :
 *   - plusValueBrute = prixRevente − capitalCible
 *   - dateRevente ≤ now() quand statut = ACTEE
 */
export class SortieProjet {
  id: string;
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  plusValueBrute: number;
  statut: StatutSortie;
  acteVentePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
