/**
 * Cycle de vie du DRAPEAU d'accès porteur — domaine pur.
 *
 * `users.porteurAccess` est une autorisation à ÉTAT : elle s'ouvre par une
 * décision instruite, elle se referme par un retrait motivé, et elle se rouvre.
 * La clause CGU de retrait exige les trois : motivé, notifié, réversible.
 *
 * Ce fichier ne connaît ni base, ni HTTP, ni notification — il dit seulement,
 * pour un état courant et un acte demandé, quel est l'état d'arrivée et si
 * l'acte est recevable. Toute l'exécution (écriture, coupure de session,
 * notification, audit) appartient au use case.
 *
 * L'horodatage `accesRevoqueLe` n'est pas décoratif : c'est le POINT DE DÉPART
 * du barème de conservation d'une demande ACCEPTÉE (« durée de l'accès, puis
 * 5 ans »). Sans lui, la purge repartait de la date de décision, faute de mieux.
 */

import {
  AccesPorteurEtatInchangeError,
  MotifRetraitRequisError,
} from './errors/porteur-access.errors';
import {
  MotifRetraitAccesPorteur,
  estMotifRetraitConnu,
} from './motif-retrait';

/**
 * État d'accès porteur tel qu'il est EN BASE (deux colonnes de `users`).
 *
 * Invariant : `porteurAccess = true` ⟹ `accesRevoqueLe = null`. Un accès qui
 * court n'a pas de date de fermeture ; l'inverse serait un état contradictoire
 * que la purge lirait de travers.
 */
export interface EtatAccesPorteur {
  porteurAccess: boolean;
  /**
   * Date du dernier retrait, `null` tant que l'accès court — ou s'il n'a
   * jamais été ouvert.
   */
  accesRevoqueLe: Date | null;
}

/** Ce que produit un acte d'instructeur sur le drapeau d'accès. */
export interface ActeSurAccesPorteur {
  /** État à écrire — les deux colonnes ensemble, jamais l'une sans l'autre. */
  etat: EtatAccesPorteur;
  /** Motif CODÉ du retrait ; `null` sur un ré-octroi. */
  motifRetrait: MotifRetraitAccesPorteur | null;
  /** Vrai quand l'acte REFERME un accès qui courait. */
  estUnRetrait: boolean;
}

/**
 * Acte d'un instructeur sur le drapeau d'accès porteur : retrait ou ré-octroi.
 *
 * Trois règles, éprouvées ici et pas seulement dans le DTO — un script, un
 * import ou un worker passeraient à côté de `class-validator` :
 *  1. l'état demandé doit DIFFÉRER de l'état courant (sinon 409) ;
 *  2. un retrait exige un motif de la liste fermée (sinon 400) ;
 *  3. un ré-octroi efface l'horodatage de retrait — l'accès court à nouveau.
 *
 * L'ordre est délibéré : « il n'y a rien à faire » prime sur « il manque un
 * motif », pour que l'instructeur ne parte pas chercher un motif sur un dossier
 * qui n'a pas besoin d'être touché.
 */
export function acterAccesPorteur(commande: {
  courant: EtatAccesPorteur;
  /** Accès VOULU après l'acte. */
  acces: boolean;
  /** Motif codé — obligatoire quand `acces` vaut `false`. */
  motif?: unknown;
  maintenant?: Date;
}): ActeSurAccesPorteur {
  const maintenant = commande.maintenant ?? new Date();

  if (commande.courant.porteurAccess === commande.acces) {
    throw new AccesPorteurEtatInchangeError(commande.courant.porteurAccess);
  }

  if (commande.acces) {
    return {
      etat: { porteurAccess: true, accesRevoqueLe: null },
      motifRetrait: null,
      estUnRetrait: false,
    };
  }

  if (!estMotifRetraitConnu(commande.motif)) {
    throw new MotifRetraitRequisError();
  }

  return {
    etat: { porteurAccess: false, accesRevoqueLe: maintenant },
    motifRetrait: commande.motif,
    estUnRetrait: true,
  };
}

/**
 * Horodatage de retrait après une DÉCISION sur une demande (acceptation ou
 * refus) — le second chemin qui écrit le drapeau.
 *
 * Un refus REFERME l'accès quand il courait : c'est un retrait, il s'horodate.
 * Un refus sur un compte qui n'avait pas l'accès ne retire rien : la date d'un
 * retrait ANTÉRIEUR doit alors survivre, sinon la purge d'une vieille demande
 * acceptée repartirait de zéro à chaque nouveau refus.
 */
export function accesRevoqueLeApresDecision(
  courant: EtatAccesPorteur,
  accepte: boolean,
  maintenant: Date,
): Date | null {
  if (accepte) return null;
  if (courant.porteurAccess) return maintenant;
  return courant.accesRevoqueLe;
}
