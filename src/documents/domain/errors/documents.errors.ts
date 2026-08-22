import type { SignatureStatus } from '../enums/signature-status.enum';
import { DocumentsError, DocumentsErrorKind } from './documents.error';

/*
 * Les messages reprennent, au caractère près, ceux que les
 * `BadRequestException` et `NotFoundException` du contrôleur portaient —
 * accents manquants compris : le front les affiche tels quels, les corriger
 * ici changerait ce que voit l'utilisateur sans que personne l'ait demandé.
 */

// ── La pièce ────────────────────────────────────────────────────────────────

/** Le document visé n'existe pas — ou n'est pas visible par le demandeur. */
export class DocumentIntrouvableError extends DocumentsError {
  readonly kind = DocumentsErrorKind.NOT_FOUND;

  constructor(documentId?: string) {
    super('Document introuvable.', {
      code: 'DOCUMENT_NOT_FOUND',
      details: documentId !== undefined ? { documentId } : undefined,
    });
  }
}

/** Un document rattaché à un projet doit dire lequel. */
export class ProjetCibleManquantError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor() {
    super('projectId manquant.', { code: 'MISSING_PROJECT_ID' });
  }
}

/** Un document rattaché à un investissement doit dire lequel. */
export class InvestissementCibleManquantError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor() {
    super('investmentId manquant.', { code: 'MISSING_INVESTMENT_ID' });
  }
}

/** Un document se rattache à un compte, un projet ou un investissement. */
export class CibleDeDocumentInvalideError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor(relatedTo?: string) {
    super('Cible de document invalide.', {
      code: 'INVALID_DOCUMENT_TARGET',
      details: relatedTo !== undefined ? { relatedTo } : undefined,
    });
  }
}

// ── La galerie d'un projet ──────────────────────────────────────────────────

/**
 * Seule une photo de projet fait une couverture. Un KBIS ou un bulletin de
 * souscription n'a pas d'image principale.
 */
export class SeulesLesPhotosSontPrincipalesError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor() {
    super('Seules les PHOTO_PROJET peuvent etre definies comme principale.', {
      code: 'NOT_A_PROJECT_PHOTO',
    });
  }
}

/** Seule une photo de projet occupe une position dans une galerie. */
export class SeulesLesPhotosOntUnOrdreError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor() {
    super("Seules les PHOTO_PROJET ont un ordre d'affichage.", {
      code: 'NOT_A_PROJECT_PHOTO',
    });
  }
}

/** Une photo sans projet ne peut ni être couverture, ni être ordonnée. */
export class DocumentSansProjetError extends DocumentsError {
  readonly kind = DocumentsErrorKind.INVALID_INPUT;

  constructor() {
    super("Ce document n'est pas lie a un projet.", {
      code: 'DOCUMENT_NOT_LINKED_TO_PROJECT',
    });
  }
}

// ── La signature ────────────────────────────────────────────────────────────

/**
 * Une signature ne quitte `PENDING` qu'une fois. C'est l'invariant qui empêche
 * un webhook rejoué de resigner un contrat déjà signé — ou d'écraser la date
 * de signature qui fait foi.
 */
export class SignatureNonModifiableError extends DocumentsError {
  readonly kind = DocumentsErrorKind.CONFLICT;

  constructor(statut: SignatureStatus) {
    super(`Signature au statut "${statut}" : elle n'est plus en attente.`, {
      code: 'SIGNATURE_NOT_PENDING',
      details: { statut },
    });
  }
}

/** Seul le signataire retire sa propre demande de signature. */
export class AnnulationReserveeAuSignataireError extends DocumentsError {
  readonly kind = DocumentsErrorKind.FORBIDDEN;

  constructor() {
    super('Non autorisé', { code: 'NOT_SIGNATURE_OWNER' });
  }
}
