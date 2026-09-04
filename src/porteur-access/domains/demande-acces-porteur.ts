/**
 * Demande d'accès porteur — domaine pur (aucun import NestJS, ORM ni HTTP).
 *
 * Décision fondateur D1 (`.claude/plans/porteur-pp-pm-acces.md`) : un
 * investisseur DEMANDE l'accès porteur, BeOwn INSTRUIT, et l'octroi ne change
 * pas le rôle — le compte reste `investisseur` et gagne un accès porteur
 * cumulé (`users.porteurAccess`). Les CGU imposent cet examen : il n'existe
 * aucun chemin d'octroi en libre-service.
 *
 * Tout l'intérêt de ce fichier est que la machine à états soit ÉPROUVABLE sans
 * base ni réseau : les transitions illégales lèvent, elles ne sont pas
 * seulement « déconseillées ».
 */

import { CGU_VERSION_COURANTE } from './cgu-version';
import {
  MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX,
  MotifRefusAccesPorteur,
  estMotifRefusConnu,
} from './motif-refus';
import {
  DecideurNonImputableError,
  DemandeAccesPorteurEtrangereError,
  MotifRefusRequisError,
  MotivationInvalideError,
  TransitionDemandeInterditeError,
} from './errors/porteur-access.errors';

export enum StatutDemandeAccesPorteur {
  /** Déposée par l'investisseur, en attente de prise en charge. */
  SOUMISE = 'soumise',
  /** Prise en charge par un instructeur ; la décision reste à rendre. */
  EN_EXAMEN = 'en_examen',
  /** Accordée : l'accès porteur est ouvert sur le compte. */
  ACCEPTEE = 'acceptee',
  /** Rejetée, motif codé obligatoire. */
  REFUSEE = 'refusee',
  /** Retirée par le demandeur avant toute décision. */
  RETIREE = 'retiree',
}

/**
 * Transitions LÉGALES, et elles seules. Une entrée vide = état terminal.
 *
 * Table plutôt que `switch` : ajouter un statut se fait en ajoutant une ligne,
 * jamais en modifiant du code existant (OCP). Le vide explicite des trois
 * états terminaux est intentionnel — il dit « rien ne sort d'ici ».
 */
export const TRANSITIONS_LEGALES: Readonly<
  Record<StatutDemandeAccesPorteur, readonly StatutDemandeAccesPorteur[]>
> = Object.freeze({
  [StatutDemandeAccesPorteur.SOUMISE]: Object.freeze([
    StatutDemandeAccesPorteur.EN_EXAMEN,
    StatutDemandeAccesPorteur.ACCEPTEE,
    StatutDemandeAccesPorteur.REFUSEE,
    StatutDemandeAccesPorteur.RETIREE,
  ]),
  [StatutDemandeAccesPorteur.EN_EXAMEN]: Object.freeze([
    StatutDemandeAccesPorteur.ACCEPTEE,
    StatutDemandeAccesPorteur.REFUSEE,
    StatutDemandeAccesPorteur.RETIREE,
  ]),
  [StatutDemandeAccesPorteur.ACCEPTEE]: Object.freeze([]),
  [StatutDemandeAccesPorteur.REFUSEE]: Object.freeze([]),
  [StatutDemandeAccesPorteur.RETIREE]: Object.freeze([]),
});

/**
 * Statuts « non terminaux » — ceux qui bloquent une seconde demande.
 *
 * Source unique : c'est la MÊME liste qui alimente la clause `where` de
 * l'index unique partiel en base (`demande_acces_porteur`). Une divergence
 * entre les deux ouvrirait la porte au doublon que l'index doit interdire.
 */
export const STATUTS_NON_TERMINAUX: readonly StatutDemandeAccesPorteur[] =
  Object.freeze([
    StatutDemandeAccesPorteur.SOUMISE,
    StatutDemandeAccesPorteur.EN_EXAMEN,
  ]);

/** Les deux statuts qui constituent une DÉCISION humaine imputable. */
export const STATUTS_DECIDES: readonly StatutDemandeAccesPorteur[] =
  Object.freeze([
    StatutDemandeAccesPorteur.ACCEPTEE,
    StatutDemandeAccesPorteur.REFUSEE,
  ]);

export function estTerminal(statut: StatutDemandeAccesPorteur): boolean {
  return TRANSITIONS_LEGALES[statut].length === 0;
}

export function transitionAutorisee(
  depuis: StatutDemandeAccesPorteur,
  vers: StatutDemandeAccesPorteur,
): boolean {
  return TRANSITIONS_LEGALES[depuis].includes(vers);
}

// ── Bornes de saisie ────────────────────────────────────────────────────────
// Éprouvées ICI et pas seulement dans le DTO : un import, un script ou un
// worker qui créerait une demande passerait à côté de `class-validator`.

export const MOTIVATION_LONGUEUR_MIN = 30;
/** Plafond DUR : au-delà, la saisie est refusée, jamais tronquée. */
export const MOTIVATION_LONGUEUR_MAX = 2000;

/**
 * Délai de carence après un REFUS, en jours.
 *
 * Throttle applicatif : instruire coûte du temps humain, et les CGU font de
 * l'examen la seule voie d'accès. Un retrait volontaire n'ouvre AUCUNE
 * carence (le demandeur s'est retiré lui-même) ; une acceptation rend toute
 * nouvelle demande sans objet.
 */
export const DELAI_CARENCE_APRES_REFUS_JOURS = 30;

// ── Engagement de délai de réponse (CGU : « 30 jours indicatifs ») ──────────

/** Délai indicatif de réponse annoncé au demandeur, en jours. */
export const DELAI_REPONSE_INDICATIF_JOURS = 30;

/**
 * Seuil d'alerte du back-office, en jours : à J+25 il reste cinq jours pour
 * tenir l'engagement. Ce module ne déclenche AUCUNE alerte — il fournit les
 * dates qui permettront à un écran ou à un cron de le faire (lot ultérieur).
 */
export const SEUIL_ALERTE_INSTRUCTION_JOURS = 25;

const ajouterJours = (depart: Date, jours: number): Date => {
  const resultat = new Date(depart.getTime());
  resultat.setDate(resultat.getDate() + jours);
  return resultat;
};

/** Date à laquelle l'engagement de réponse est dépassé. */
export function echeanceReponseIndicative(soumiseLe: Date): Date {
  return ajouterJours(soumiseLe, DELAI_REPONSE_INDICATIF_JOURS);
}

/** Date à partir de laquelle le dossier doit remonter en alerte (J+25). */
export function alerteInstructionLe(soumiseLe: Date): Date {
  return ajouterJours(soumiseLe, SEUIL_ALERTE_INSTRUCTION_JOURS);
}

/** Une demande encore ouverte a-t-elle franchi le seuil d'alerte ? */
export function instructionEnAlerte(
  demande: Pick<EtatDemandeAccesPorteur, 'statut' | 'soumiseLe'>,
  maintenant: Date = new Date(),
): boolean {
  if (estTerminal(demande.statut)) return false;
  return maintenant >= alerteInstructionLe(demande.soumiseLe);
}

/** État complet, tel qu'il transite depuis/vers la persistance. */
export interface EtatDemandeAccesPorteur {
  /** `null` tant que la persistance n'a pas attribué d'identifiant. */
  id: string | null;
  utilisateurId: number;
  statut: StatutDemandeAccesPorteur;
  motivation: string;
  /** Version des CGU en vigueur À LA SOUMISSION, figée côté serveur. */
  cguVersionAcceptee: string;
  soumiseLe: Date;
  decideeLe: Date | null;
  /**
   * Administrateur AUTEUR de la décision. Jamais nul sur une demande décidée
   * (`acceptee` / `refusee`) : les CGU engagent BeOwn à ne rendre AUCUNE
   * décision entièrement automatisée, l'imputation humaine en est la preuve.
   */
  decideurAdminId: number | null;
  /** Motif CODÉ (liste fermée), communiqué au demandeur. */
  motifRefus: MotifRefusAccesPorteur | null;
  /** Précision libre INTERNE — jamais communiquée au demandeur. */
  motifRefusComplement: string | null;
}

/** Normalise et éprouve une motivation. Lève si elle est hors bornes. */
function eprouverMotivation(brut: string): string {
  const motivation = (brut ?? '').trim();
  if (motivation.length < MOTIVATION_LONGUEUR_MIN) {
    throw new MotivationInvalideError(
      `La motivation doit compter au moins ${MOTIVATION_LONGUEUR_MIN} caractères.`,
    );
  }
  if (motivation.length > MOTIVATION_LONGUEUR_MAX) {
    throw new MotivationInvalideError(
      `La motivation ne peut pas dépasser ${MOTIVATION_LONGUEUR_MAX} caractères.`,
    );
  }
  return motivation;
}

/** Éprouve le motif codé. Lève s'il est absent ou hors liste. */
function eprouverMotifRefus(brut: unknown): MotifRefusAccesPorteur {
  if (!estMotifRefusConnu(brut)) {
    throw new MotifRefusRequisError();
  }
  return brut;
}

/** Normalise le complément interne. Lève s'il dépasse la borne. */
function eprouverComplement(brut: string | null | undefined): string | null {
  const complement = (brut ?? '').trim();
  if (complement.length === 0) return null;
  if (complement.length > MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX) {
    throw new MotifRefusRequisError(
      `Le complément interne ne peut pas dépasser ${MOTIF_REFUS_COMPLEMENT_LONGUEUR_MAX} caractères.`,
    );
  }
  return complement;
}

/** Un identifiant d'administrateur exploitable — pas 0, pas NaN, pas négatif. */
function eprouverDecideur(decideurAdminId: number): number {
  if (!Number.isInteger(decideurAdminId) || decideurAdminId <= 0) {
    throw new DecideurNonImputableError();
  }
  return decideurAdminId;
}

/**
 * Date à partir de laquelle une nouvelle demande redevient recevable après une
 * décision. `null` = aucune carence.
 */
export function finDeCarence(
  derniere: Pick<EtatDemandeAccesPorteur, 'statut' | 'decideeLe'>,
): Date | null {
  if (derniere.statut !== StatutDemandeAccesPorteur.REFUSEE) return null;
  if (!derniere.decideeLe) return null;
  return ajouterJours(derniere.decideeLe, DELAI_CARENCE_APRES_REFUS_JOURS);
}

/**
 * Invariant d'imputabilité : toute demande DÉCIDÉE porte l'identifiant de
 * l'administrateur qui a tranché. Exposé pour être éprouvé (tests, contrôle
 * d'intégrité) autant que pour documenter la règle.
 */
export function decisionEstImputable(
  etat: Pick<EtatDemandeAccesPorteur, 'statut' | 'decideurAdminId'>,
): boolean {
  if (!STATUTS_DECIDES.includes(etat.statut)) return true;
  return typeof etat.decideurAdminId === 'number' && etat.decideurAdminId > 0;
}

/**
 * Demande d'accès porteur.
 *
 * L'état est privé : aucun appelant ne peut poser `statut = 'acceptee'` à la
 * main. Chaque transition passe par une méthode qui vérifie d'abord la
 * légalité du passage, ce qui rend l'état illégal inatteignable plutôt que
 * simplement interdit par convention.
 */
export class DemandeAccesPorteur {
  private constructor(private readonly etat: EtatDemandeAccesPorteur) {}

  /** Dépôt d'une demande neuve — le seul chemin de création. */
  static soumettre(props: {
    utilisateurId: number;
    motivation: string;
    maintenant?: Date;
  }): DemandeAccesPorteur {
    return new DemandeAccesPorteur({
      id: null,
      utilisateurId: props.utilisateurId,
      statut: StatutDemandeAccesPorteur.SOUMISE,
      motivation: eprouverMotivation(props.motivation),
      // Constante SERVEUR : la version acceptée est une preuve, elle ne peut
      // pas venir de l'appelant (cf. cgu-version.ts).
      cguVersionAcceptee: CGU_VERSION_COURANTE,
      soumiseLe: props.maintenant ?? new Date(),
      decideeLe: null,
      decideurAdminId: null,
      motifRefus: null,
      motifRefusComplement: null,
    });
  }

  /** @internal Réservé aux adaptateurs de persistance. */
  static restaurer(etat: EtatDemandeAccesPorteur): DemandeAccesPorteur {
    return new DemandeAccesPorteur({ ...etat });
  }

  // ── Lectures (aucun setter) ───────────────────────────────────────────────

  get id(): string | null {
    return this.etat.id;
  }
  get utilisateurId(): number {
    return this.etat.utilisateurId;
  }
  get statut(): StatutDemandeAccesPorteur {
    return this.etat.statut;
  }
  get motivation(): string {
    return this.etat.motivation;
  }
  get cguVersionAcceptee(): string {
    return this.etat.cguVersionAcceptee;
  }
  get soumiseLe(): Date {
    return this.etat.soumiseLe;
  }
  get decideeLe(): Date | null {
    return this.etat.decideeLe;
  }
  get decideurAdminId(): number | null {
    return this.etat.decideurAdminId;
  }
  get motifRefus(): MotifRefusAccesPorteur | null {
    return this.etat.motifRefus;
  }
  /** INTERNE : ne jamais publier hors back-office. */
  get motifRefusComplement(): string | null {
    return this.etat.motifRefusComplement;
  }

  /** Une demande en cours est celle qui bloque le dépôt d'une seconde. */
  estEnCours(): boolean {
    return !estTerminal(this.etat.statut);
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /** Prise en charge par un instructeur du back-office. */
  prendreEnExamen(decideurAdminId: number): void {
    this.exigerTransition(StatutDemandeAccesPorteur.EN_EXAMEN);
    const admin = eprouverDecideur(decideurAdminId);
    this.etat.statut = StatutDemandeAccesPorteur.EN_EXAMEN;
    // Pas de `decideeLe` : la prise en charge n'est pas une décision. On note
    // seulement QUI instruit, pour que le dossier ait un responsable identifié
    // dès sa prise en charge.
    this.etat.decideurAdminId = admin;
  }

  /** Octroi. L'écriture de `users.porteurAccess` appartient au use case. */
  accepter(decideurAdminId: number, maintenant: Date = new Date()): void {
    this.exigerTransition(StatutDemandeAccesPorteur.ACCEPTEE);
    const admin = eprouverDecideur(decideurAdminId);
    this.etat.statut = StatutDemandeAccesPorteur.ACCEPTEE;
    this.etat.decideurAdminId = admin;
    this.etat.decideeLe = maintenant;
    this.etat.motifRefus = null;
    this.etat.motifRefusComplement = null;
  }

  /**
   * Rejet. Le motif CODÉ est obligatoire ; le complément est libre, facultatif
   * et strictement interne — il ne sort ni en notification, ni en export.
   */
  refuser(
    decideurAdminId: number,
    motif: unknown,
    complement?: string | null,
    maintenant: Date = new Date(),
  ): void {
    // Ordre voulu : la légalité de la transition d'abord (« déjà décidée »
    // prime sur « motif manquant »), l'imputation et le motif ensuite.
    this.exigerTransition(StatutDemandeAccesPorteur.REFUSEE);
    const admin = eprouverDecideur(decideurAdminId);
    const motifCode = eprouverMotifRefus(motif);
    const complementEprouve = eprouverComplement(complement);

    this.etat.statut = StatutDemandeAccesPorteur.REFUSEE;
    this.etat.decideurAdminId = admin;
    this.etat.decideeLe = maintenant;
    this.etat.motifRefus = motifCode;
    this.etat.motifRefusComplement = complementEprouve;
  }

  /**
   * Retrait par le demandeur, tant qu'aucune décision n'est rendue.
   *
   * L'appartenance est vérifiée DANS le domaine : c'est une règle métier
   * (« on ne retire que sa propre demande »), pas un détail de transport. Le
   * contrôleur ne peut donc pas l'oublier. Aucun `decideurAdminId` n'est posé :
   * un retrait n'est pas une décision de BeOwn.
   */
  retirer(parUtilisateurId: number, maintenant: Date = new Date()): void {
    if (parUtilisateurId !== this.etat.utilisateurId) {
      throw new DemandeAccesPorteurEtrangereError();
    }
    this.exigerTransition(StatutDemandeAccesPorteur.RETIREE);
    this.etat.statut = StatutDemandeAccesPorteur.RETIREE;
    this.etat.decideeLe = maintenant;
  }

  /** @internal Réservé aux adaptateurs de persistance. */
  snapshot(): EtatDemandeAccesPorteur {
    return { ...this.etat };
  }

  private exigerTransition(vers: StatutDemandeAccesPorteur): void {
    if (!transitionAutorisee(this.etat.statut, vers)) {
      throw new TransitionDemandeInterditeError(this.etat.statut, vers);
    }
  }
}
