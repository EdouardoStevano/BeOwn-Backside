import {
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';

/**
 * Barème de conservation RGPD — transcription EN CODE du barème validé par la
 * mission conformité (dépôt Frontside,
 * `docs/conformite/2026-09-03-baremes-lot2.md`, sections 1 et 2).
 *
 * Domaine PUR : aucune dépendance framework, ORM ou réseau — tout se teste
 * avec des dates en mémoire. Les durées et points de départ sont ceux du
 * barème ; toute modification ici doit d'abord passer par une révision du
 * document de conformité (l'avocat fige les valeurs, pas le code).
 *
 * Finalités NON portées par ce module (documenté, pas oublié) :
 * - Tokens/OTP (ligne 12 du barème) : les OTP d'inscription et codes OAuth
 *   vivent dans le cache Redis avec TTL — ils expirent d'eux-mêmes, il n'y a
 *   aucune table à purger.
 * - Logs applicatifs (ligne 10) : rotation gérée par l'infrastructure de
 *   journalisation (pino/stdout → collecteur), hors base de données.
 * - Cookies (ligne 13) : côté navigateur, gérés par le bandeau front.
 */

/** Finalités purgées par le cron RGPD, journalisées une à une (art. 5.2 RGPD). */
export enum FinalitePurge {
  /** Ligne 1 du barème : inscription jamais activée — purge complète à J+30. */
  COMPTE_JAMAIS_ACTIVE = 'compte_jamais_active',
  /** Ligne 2 : prospect activé mais sans KYC/investissement ni connexion — 3 ans. */
  PROSPECT_INACTIF = 'prospect_inactif',
  /**
   * Filet de sécurité §2 : compte passé SUPPRIME dont l'anonymisation n'a pas
   * (encore) eu lieu — échec transitoire lors de la suppression, ou stock
   * antérieur au lot 2. Traité immédiatement (durée 0).
   */
  COMPTE_SUPPRIME_A_ANONYMISER = 'compte_supprime_a_anonymiser',
  /** Ligne 4 : dossier KYC archivé, purgé 5 ans après la clôture (L. 561-12 CMF). */
  KYC_ECHEANCE_POST_CLOTURE = 'kyc_echeance_post_cloture',
  /** Ligne 11 : notifications, 12 mois après émission. */
  NOTIFICATIONS = 'notifications',
  /** Ligne 9 : journaux d'audit, 5 ans après l'événement. */
  JOURNAUX_AUDIT = 'journaux_audit',
}

/** Durée de conservation d'une finalité, en unités CALENDAIRES (pas en ms). */
export interface DureeRetention {
  jours?: number;
  mois?: number;
  annees?: number;
}

export const DUREES_RETENTION: Readonly<
  Record<FinalitePurge, Readonly<DureeRetention>>
> = Object.freeze({
  [FinalitePurge.COMPTE_JAMAIS_ACTIVE]: Object.freeze({ jours: 30 }),
  [FinalitePurge.PROSPECT_INACTIF]: Object.freeze({ annees: 3 }),
  [FinalitePurge.COMPTE_SUPPRIME_A_ANONYMISER]: Object.freeze({ jours: 0 }),
  [FinalitePurge.KYC_ECHEANCE_POST_CLOTURE]: Object.freeze({ annees: 5 }),
  [FinalitePurge.NOTIFICATIONS]: Object.freeze({ mois: 12 }),
  [FinalitePurge.JOURNAUX_AUDIT]: Object.freeze({ annees: 5 }),
});

/**
 * Date limite de conservation pour un point de départ donné : au-delà de
 * `dateEcheance(...)`, la donnée est échue. Arithmétique calendaire (un « an »
 * est un an civil, pas 365 × 24 h) — c'est ce qu'exigent les textes cités.
 */
export function dateEcheance(
  finalite: FinalitePurge,
  pointDeDepart: Date,
): Date {
  const duree = DUREES_RETENTION[finalite];
  const echeance = new Date(pointDeDepart.getTime());
  if (duree.annees) echeance.setFullYear(echeance.getFullYear() + duree.annees);
  if (duree.mois) echeance.setMonth(echeance.getMonth() + duree.mois);
  if (duree.jours) echeance.setDate(echeance.getDate() + duree.jours);
  return echeance;
}

/** Une donnée est échue quand son échéance est STRICTEMENT dépassée. */
export function estEchu(
  finalite: FinalitePurge,
  pointDeDepart: Date,
  maintenant: Date,
): boolean {
  return dateEcheance(finalite, pointDeDepart).getTime() < maintenant.getTime();
}

/**
 * Seuil SQL équivalent : une ligne dont le point de départ est ANTÉRIEUR à
 * `seuilPurge(finalite, maintenant)` est échue. C'est l'inverse exact de
 * `dateEcheance` (on recule au lieu d'avancer), pour écrire
 * `WHERE "createdAt" < $seuil` sans recalculer l'échéance ligne à ligne.
 */
export function seuilPurge(finalite: FinalitePurge, maintenant: Date): Date {
  const duree = DUREES_RETENTION[finalite];
  const seuil = new Date(maintenant.getTime());
  if (duree.annees) seuil.setFullYear(seuil.getFullYear() - duree.annees);
  if (duree.mois) seuil.setMonth(seuil.getMonth() - duree.mois);
  if (duree.jours) seuil.setDate(seuil.getDate() - duree.jours);
  return seuil;
}

// ─── Anonymisation à la suppression de compte (barème §2) ───────────────────

/**
 * Régime d'anonymisation d'un compte supprimé (barème §2.1 / §2.2) :
 * - PURGE_TOTALE : aucune obligation de conservation (jamais de KYC engagé,
 *   jamais de transaction) — tous les identifiants directs sont écrasés,
 *   identité comprise.
 * - ARCHIVAGE_RESTREINT : le compte porte des obligations (LCB-FT et/ou
 *   comptables) — nom, prénom, date de naissance et nationalité sont CONSERVÉS
 *   5 ans post-clôture (L. 561-12 CMF, exception de l'art. 17.3.b RGPD), le
 *   reste est écrasé.
 */
export enum RegimeAnonymisation {
  PURGE_TOTALE = 'purge_totale',
  ARCHIVAGE_RESTREINT = 'archivage_restreint',
}

export interface ObligationsConservation {
  /** Un dossier KYC a été engagé (statut au-delà de « non démarré »). */
  kycEngage: boolean;
  /** Au moins une écriture wallet (dépôt, retrait, souscription, cession…). */
  aTransactions: boolean;
  /** Au moins un investissement, même soldé ou annulé. */
  aInvestissements: boolean;
}

export function regimeAnonymisation(
  obligations: ObligationsConservation,
): RegimeAnonymisation {
  return obligations.kycEngage ||
    obligations.aTransactions ||
    obligations.aInvestissements
    ? RegimeAnonymisation.ARCHIVAGE_RESTREINT
    : RegimeAnonymisation.PURGE_TOTALE;
}

/**
 * Email de remplacement, irréversible et non résoluble, unicité préservée
 * (barème §2.2, format imposé par le plan de lot).
 */
export function emailAnonymise(userId: number): string {
  return `supprime-${userId}@anonymise.invalid`;
}

// ─── Sort des pièces à la suppression (barème §2.3) ─────────────────────────

export enum SortDocument {
  /** Pièce KYC : marquée « conservation légale », purgée à clôture + 5 ans. */
  ARCHIVER_CONSERVATION_LEGALE = 'archiver_conservation_legale',
  /** Aucune obligation : suppression immédiate (fichier + ligne). */
  SUPPRIMER = 'supprimer',
  /** Pièce contractuelle/comptable/fiscale : intacte 10 ans (L. 213-1 C. conso, L. 123-22 C. com.). */
  CONSERVER = 'conserver',
}

/** Pièces du dossier KYC au sens L. 561-12 CMF (archivage 5 ans post-clôture). */
const TYPES_KYC: ReadonlyArray<DocumentType> = Object.freeze([
  DocumentType.IDENTITE,
  DocumentType.SELFIE,
  DocumentType.JUSTIFICATIF_DOMICILE,
  // Le justificatif de revenu relève de la connaissance client LCB-FT
  // (adéquation/catégorisation) : même régime que le reste du dossier.
  DocumentType.JUSTIFICATIF_REVENU,
]);

/** Pièces sans obligation de conservation propre à l'utilisateur. */
const TYPES_SUPPRIMABLES: ReadonlyArray<DocumentType> = Object.freeze([
  DocumentType.AUTRE,
]);

/**
 * Sort d'un document RATTACHÉ À L'UTILISATEUR à la suppression du compte.
 * Règle transverse n° 1 du barème : la durée la plus longue l'emporte — tout
 * type non listé comme supprimable est conservé par défaut (contrats,
 * bulletins, certificats, IFU, documents projet…) : on ne détruit jamais par
 * omission.
 */
export function sortDocumentUtilisateur(type: DocumentType): SortDocument {
  if (TYPES_KYC.includes(type)) {
    return SortDocument.ARCHIVER_CONSERVATION_LEGALE;
  }
  if (TYPES_SUPPRIMABLES.includes(type)) {
    return SortDocument.SUPPRIMER;
  }
  return SortDocument.CONSERVER;
}

// ─── Bornes d'exécution du cron (règle « lots bornés » du plan de lot) ──────

/** Taille d'un lot de purge : aucun DELETE/UPDATE massif sans LIMIT. */
export const TAILLE_LOT_PURGE = 200;

/**
 * Nombre maximal de lots par finalité et par exécution : borne le travail d'un
 * run (4 000 lignes max par finalité) — le stock résiduel attend le run
 * suivant, le cron est quotidien.
 */
export const MAX_LOTS_PAR_RUN = 20;
