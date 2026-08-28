import { ChampProfilInvalideError } from 'src/compliance/domain/errors/champ-profil.errors';

/** Longueur d'un motif de refus — assez pour être utile, pas pour un roman. */
const MAX_MOTIF = 500;

/**
 * Où en est l'instruction d'une pièce.
 *
 * Trois états, et pas de quatrième : une pièce est déposée, puis acceptée ou
 * refusée. Il n'y a **pas** d'état « transmise au PSP » tant qu'aucun contrat
 * de validation automatique n'est arrêté — inventer un statut que rien ne fait
 * avancer laisserait des dossiers coincés là pour toujours.
 */
export enum StatutPiece {
  EN_ATTENTE = 'en_attente',
  ACCEPTEE = 'acceptee',
  REFUSEE = 'refusee',
}

export interface DecisionPieceSnapshot {
  statut: StatutPiece;
  motifRefus: string | null;
  decideeLe: Date | null;
}

/**
 * L'instruction d'une pièce : son statut, ce qui l'explique, et quand elle a
 * été tranchée.
 *
 * Les trois vont ensemble parce qu'ils portent un invariant commun, et c'est
 * tout l'intérêt du bloc : **un refus sans motif n'est pas opposable**. Le
 * cahier des charges veut que le titulaire « puisse modifier lui-même les
 * documents refusés » — encore faut-il lui dire lequel, et pourquoi. À
 * l'inverse, une acceptation ne porte pas de motif : le garder ferait traîner
 * la raison d'un refus corrigé depuis.
 *
 * Même forme et même raison d'être que `DecisionKyc`, qui fait ce travail pour
 * le dossier de vérification d'identité.
 *
 * **Immuable** — cf. `Identite`.
 */
export class DecisionPiece {
  private constructor(private readonly etat: DecisionPieceSnapshot) {}

  /** Une pièce qui vient d'être déposée attend son instruction. */
  static enAttente(): DecisionPiece {
    return new DecisionPiece({
      statut: StatutPiece.EN_ATTENTE,
      motifRefus: null,
      decideeLe: null,
    });
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: DecisionPieceSnapshot): DecisionPiece {
    return new DecisionPiece({
      statut: snapshot.statut,
      motifRefus: snapshot.motifRefus ?? null,
      decideeLe: snapshot.decideeLe ?? null,
    });
  }

  /** La pièce convient : le motif d'un refus antérieur ne survit pas. */
  acceptee(le: Date): DecisionPiece {
    return new DecisionPiece({
      statut: StatutPiece.ACCEPTEE,
      motifRefus: null,
      decideeLe: le,
    });
  }

  /**
   * La pièce est refusée, et le motif part au titulaire.
   *
   * Il est **obligatoire** : « votre document est refusé » n'aide personne à le
   * corriger, et le cahier des charges attend précisément qu'il le corrige
   * lui-même.
   */
  refusee(motif: string, le: Date): DecisionPiece {
    const nettoye = motif?.trim() ?? '';
    if (nettoye.length === 0) {
      throw new ChampProfilInvalideError(
        'Le motif de refus',
        'est obligatoire : le titulaire doit savoir quoi corriger.',
        'motifRefus',
      );
    }
    if (nettoye.length > MAX_MOTIF) {
      throw new ChampProfilInvalideError(
        'Le motif de refus',
        `ne peut pas dépasser ${MAX_MOTIF} caractères.`,
        'motifRefus',
      );
    }

    return new DecisionPiece({
      statut: StatutPiece.REFUSEE,
      motifRefus: nettoye,
      decideeLe: le,
    });
  }

  estAcceptee(): boolean {
    return this.etat.statut === StatutPiece.ACCEPTEE;
  }

  estRefusee(): boolean {
    return this.etat.statut === StatutPiece.REFUSEE;
  }

  estEnAttente(): boolean {
    return this.etat.statut === StatutPiece.EN_ATTENTE;
  }

  get statut(): StatutPiece {
    return this.etat.statut;
  }
  get motifRefus(): string | null {
    return this.etat.motifRefus;
  }
  get decideeLe(): Date | null {
    return this.etat.decideeLe;
  }

  toSnapshot(): DecisionPieceSnapshot {
    return { ...this.etat };
  }
}
