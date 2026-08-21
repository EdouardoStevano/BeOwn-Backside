/**
 * Traitement des réclamations — art. 27 du règlement (UE) 2020/1503, règlement
 * délégué (UE) 2022/2117 et instruction AMF DOC-2012-07.
 *
 * Domaine pur. Les exigences structurantes :
 *  - la procédure est GRATUITE pour le client ;
 *  - un accusé de réception est envoyé sous dix jours ouvrables ;
 *  - une réponse motivée, en langage clair, est apportée sous deux mois ;
 *  - chaque réclamation et sa suite sont conservées pour la piste d'audit.
 */

export enum CategorieReclamation {
  /** Fonctionnement de la plateforme, accès au compte, incident technique. */
  PLATEFORME = 'plateforme',
  /** Information fournie sur un projet, sa description ou ses documents. */
  INFORMATION_PROJET = 'information_projet',
  /** Souscription, rétractation, allocation de fractions. */
  SOUSCRIPTION = 'souscription',
  /** Versements, distributions, échéances, retraits. */
  FLUX_FINANCIERS = 'flux_financiers',
  /** Frais prélevés par la plateforme. */
  FRAIS = 'frais',
  /** Marché secondaire et cession de parts. */
  MARCHE_SECONDAIRE = 'marche_secondaire',
  /** Données personnelles, exercice des droits. */
  DONNEES_PERSONNELLES = 'donnees_personnelles',
  AUTRE = 'autre',
}

export enum StatutReclamation {
  RECUE = 'recue',
  ACCUSE_RECEPTION = 'accuse_reception',
  EN_INSTRUCTION = 'en_instruction',
  RESOLUE = 'resolue',
  REJETEE = 'rejetee',
}

/** DOC-2012-07 : accusé de réception sous dix jours ouvrables. */
export const DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES = 10;

/** DOC-2012-07 : réponse sous deux mois à compter de la réception. */
export const DELAI_REPONSE_MOIS = 2;

/**
 * Art. 27(1) : le traitement des réclamations est gratuit. Constante explicite
 * plutôt qu'implicite : elle documente une interdiction de facturer.
 */
export const TRAITEMENT_GRATUIT = true;

export class Reclamation {
  id: string;
  /** Référence communiquée au réclamant, stable et citable. */
  reference: string;
  utilisateurId: number;
  categorie: CategorieReclamation;
  objet: string;
  description: string;
  projetId: string | null = null;
  investissementId: string | null = null;
  statut: StatutReclamation = StatutReclamation.RECUE;
  accuseReceptionLe: Date | null = null;
  reponse: string | null = null;
  reponduLe: Date | null = null;
  traiteParUserId: number | null = null;
  /** Échéance de la réponse, calculée à la réception. */
  echeanceReponse: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Ajoute `jours` jours ouvrables à une date, en sautant samedis et dimanches. */
export function ajouterJoursOuvrables(depart: Date, jours: number): Date {
  const resultat = new Date(depart.getTime());
  let restants = jours;
  while (restants > 0) {
    resultat.setDate(resultat.getDate() + 1);
    const jour = resultat.getDay();
    if (jour !== 0 && jour !== 6) restants -= 1;
  }
  return resultat;
}

/** Échéance de l'accusé de réception pour une réclamation reçue à `recueLe`. */
export function echeanceAccuseReception(recueLe: Date): Date {
  return ajouterJoursOuvrables(recueLe, DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES);
}

/** Échéance de la réponse motivée pour une réclamation reçue à `recueLe`. */
export function echeanceReponse(recueLe: Date): Date {
  const echeance = new Date(recueLe.getTime());
  echeance.setMonth(echeance.getMonth() + DELAI_REPONSE_MOIS);
  return echeance;
}

export interface EtatDelais {
  accuseReceptionEnRetard: boolean;
  reponseEnRetard: boolean;
}

/**
 * Évalue les deux délais réglementaires. Une réclamation close ne peut plus
 * être en retard : le retard mesure une obligation encore due.
 */
export function evaluerDelais(
  reclamation: Pick<
    Reclamation,
    'statut' | 'createdAt' | 'accuseReceptionLe' | 'reponduLe'
  >,
  maintenant: Date = new Date(),
): EtatDelais {
  const close =
    reclamation.statut === StatutReclamation.RESOLUE ||
    reclamation.statut === StatutReclamation.REJETEE;

  return {
    accuseReceptionEnRetard:
      !reclamation.accuseReceptionLe &&
      maintenant > echeanceAccuseReception(reclamation.createdAt),
    reponseEnRetard:
      !close &&
      !reclamation.reponduLe &&
      maintenant > echeanceReponse(reclamation.createdAt),
  };
}

/**
 * Référence lisible communiquée au réclamant. Le compteur garantit l'unicité
 * intra-journalière sans dépendre d'un identifiant technique.
 */
export function genererReference(recueLe: Date, sequence: number): string {
  const annee = recueLe.getFullYear();
  const mois = String(recueLe.getMonth() + 1).padStart(2, '0');
  const jour = String(recueLe.getDate()).padStart(2, '0');
  return `REC-${annee}${mois}${jour}-${String(sequence).padStart(4, '0')}`;
}
