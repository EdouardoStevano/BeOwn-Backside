/**
 * Délai de rétractation — règle propre à BeOwn.
 *
 * Domaine pur : aucun import NestJS, aucune notion de HTTP.
 *
 * NATURE DE LA RÈGLE. Ce délai n'est imposé à BeOwn par aucun texte : la
 * plateforme se l'impose à elle-même et le publie dans ses conditions
 * générales et dans le document d'informations clés de chaque opération. Il
 * engage donc BeOwn contractuellement vis-à-vis de l'investisseur, et il n'est
 * pas la transposition d'un régime dont la plateforme relèverait.
 *
 * SOURCE UNIQUE. `DELAI_RETRACTATION_JOURS` est la SEULE valeur numérique du
 * dépôt qui exprime cette durée. Tout le reste en dérive :
 *
 *  - `calculerEcheanceRetractation` — pose l'échéance à la souscription ;
 *  - `LIBELLE_DELAI_RETRACTATION` — la formulation en toutes lettres servie
 *    aux investisseurs (document d'informations clés, messages d'erreur,
 *    résumés Swagger) ;
 *  - `verifierEligibiliteRetractation` — le verdict et son code d'erreur.
 *
 * Changer la durée, c'est donc changer cette constante et rien d'autre. Aucun
 * appelant ne doit recalculer une échéance ni écrire « quatre jours » en dur :
 * la revue rejette toute duplication de la valeur ou de son libellé.
 *
 * Trois points de vigilance sur la règle elle-même :
 *
 *  1. Le délai se compte en jours CALENDAIRES, pas ouvrés.
 *  2. Il ne bénéficie qu'aux investisseurs NON AVERTIS. Un investissement
 *     souscrit par un averti n'a pas d'échéance (`null`) et n'est pas
 *     rétractable.
 *  3. Pendant le délai, l'investisseur peut renoncer sans avoir à se justifier
 *     et sans pénalité. L'engagement n'est donc pas définitif : les fonds ne
 *     doivent pas être mis à disposition du porteur de projet.
 */

import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';

/**
 * Durée du délai de rétractation, en jours calendaires.
 *
 * SEUL ENDROIT À MODIFIER pour changer la durée. La valeur actuelle est un
 * arbitrage produit ; sa révision est une décision qui se prend hors du code.
 */
export const DELAI_RETRACTATION_JOURS = 4;

/**
 * Écriture en toutes lettres des durées susceptibles d'être retenues. Sert
 * uniquement à composer `LIBELLE_DELAI_RETRACTATION` : hors de cette table, le
 * chiffre est servi tel quel, ce qui reste lisible mais moins soigné.
 */
const NOMBRES_EN_LETTRES: ReadonlyMap<number, string> = new Map([
  [1, 'un'],
  [2, 'deux'],
  [3, 'trois'],
  [4, 'quatre'],
  [5, 'cinq'],
  [6, 'six'],
  [7, 'sept'],
  [8, 'huit'],
  [9, 'neuf'],
  [10, 'dix'],
  [11, 'onze'],
  [12, 'douze'],
  [13, 'treize'],
  [14, 'quatorze'],
  [15, 'quinze'],
  [16, 'seize'],
  [20, 'vingt'],
  [30, 'trente'],
]);

/** « quatre » pour 4, « quatorze » pour 14, « 21 » pour 21. */
export const DELAI_RETRACTATION_EN_LETTRES: string =
  NOMBRES_EN_LETTRES.get(DELAI_RETRACTATION_JOURS) ??
  String(DELAI_RETRACTATION_JOURS);

/**
 * Formulation unique de la durée à destination des investisseurs — « quatre
 * jours calendaires ». Toute mention du délai dans un texte servi (document
 * d'informations clés, message d'erreur, documentation d'API) se compose à
 * partir d'ici, jamais à la main.
 */
export const LIBELLE_DELAI_RETRACTATION: string = `${DELAI_RETRACTATION_EN_LETTRES} jour${
  DELAI_RETRACTATION_JOURS > 1 ? 's' : ''
} calendaire${DELAI_RETRACTATION_JOURS > 1 ? 's' : ''}`;

/** Échéance du délai pour une souscription faite à `souscritLe`. */
export function calculerEcheanceRetractation(souscritLe: Date): Date {
  const echeance = new Date(souscritLe.getTime());
  echeance.setDate(echeance.getDate() + DELAI_RETRACTATION_JOURS);
  return echeance;
}

/** Vrai tant que l'investisseur peut encore se rétracter. */
export function retractationOuverte(
  echeance: Date | null,
  maintenant: Date,
): boolean {
  if (!echeance) return false;
  return maintenant.getTime() <= new Date(echeance).getTime();
}

/** Temps restant, en millisecondes, avant l'expiration du délai. */
export function tempsRestantRetractation(
  echeance: Date | null,
  maintenant: Date,
): number {
  if (!echeance) return 0;
  return Math.max(0, new Date(echeance).getTime() - maintenant.getTime());
}

// ── Éligibilité d'une demande de rétractation ────────────────────────────────
//
// Le domaine dit POURQUOI la demande est refusée et sous quel code stable ; la
// couche présentation choisit le statut HTTP. Le front distingue ainsi « trop
// tard » de « pas au bon statut » sans avoir à lire un message en français.

/** Seul statut depuis lequel une souscription peut être rétractée. */
export const CODE_RETRACTATION_STATUT_INCOMPATIBLE =
  'RETRACTATION_STATUT_INCOMPATIBLE';
/** L'investissement n'ouvre aucun délai (investisseur averti). */
export const CODE_RETRACTATION_NON_APPLICABLE = 'RETRACTATION_NON_APPLICABLE';
/** Le délai est écoulé : l'engagement est devenu définitif. */
export const CODE_RETRACTATION_DELAI_EXPIRE = 'RETRACTATION_DELAI_EXPIRE';
/** Une autre demande a déjà rétracté cette souscription. */
export const CODE_RETRACTATION_DEJA_EFFECTUEE = 'RETRACTATION_DEJA_EFFECTUEE';
/** La souscription visée appartient à un autre investisseur. */
export const CODE_RETRACTATION_NON_PROPRIETAIRE =
  'RETRACTATION_NON_PROPRIETAIRE';
/** La souscription visée n'existe pas. */
export const CODE_RETRACTATION_INTROUVABLE = 'RETRACTATION_INTROUVABLE';

export type MotifRefusRetractation =
  | typeof CODE_RETRACTATION_STATUT_INCOMPATIBLE
  | typeof CODE_RETRACTATION_NON_APPLICABLE
  | typeof CODE_RETRACTATION_DELAI_EXPIRE;

export interface DemandeRetractation {
  statut: InvestmentStatus;
  /** Échéance posée à la souscription ; `null` pour un investisseur averti. */
  echeance: Date | null;
  maintenant: Date;
}

export interface VerdictRetractation {
  autorisee: boolean;
  code: MotifRefusRetractation | null;
  /** Message destiné à l'investisseur. `null` quand la demande est recevable. */
  motif: string | null;
  /** Échéance du délai, reprise telle quelle pour être renvoyée au front. */
  expireLe: Date | null;
}

/**
 * Verdict d'une demande de rétractation. Les conditions sont évaluées dans un
 * ordre stable — statut, puis existence du délai, puis expiration — pour que le
 * code de refus soit reproductible.
 */
export function verifierEligibiliteRetractation(
  demande: DemandeRetractation,
): VerdictRetractation {
  const expireLe = demande.echeance ? new Date(demande.echeance) : null;

  if (demande.statut !== InvestmentStatus.EN_DELAI_RETRACTATION) {
    return {
      autorisee: false,
      code: CODE_RETRACTATION_STATUT_INCOMPATIBLE,
      motif: `Investissement au statut "${demande.statut}" non annulable`,
      expireLe,
    };
  }

  if (!demande.echeance) {
    return {
      autorisee: false,
      code: CODE_RETRACTATION_NON_APPLICABLE,
      motif:
        "Cet investissement n'ouvre pas de délai de rétractation : celui-ci " +
        'est réservé aux investisseurs non avertis.',
      expireLe: null,
    };
  }

  if (!retractationOuverte(demande.echeance, demande.maintenant)) {
    return {
      autorisee: false,
      code: CODE_RETRACTATION_DELAI_EXPIRE,
      motif: `Le délai de rétractation de ${LIBELLE_DELAI_RETRACTATION} est dépassé`,
      expireLe,
    };
  }

  return { autorisee: true, code: null, motif: null, expireLe };
}
