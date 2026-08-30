export const IDENTITY_VERIFICATION_PORT = Symbol('IDENTITY_VERIFICATION_PORT');

/** Session de vérification ouverte chez le fournisseur. */
export interface VerificationSessionResult {
  sessionId: string;
  url: string;
  status: string;
  /**
   * Pourquoi le fournisseur n'a pas conclu — `undefined` quand il a conclu, ou
   * quand il n'en dit rien.
   *
   * Il ne transitait jusqu'ici que par les **événements** : la lecture directe
   * d'une session rendait son statut sans jamais dire ce qui l'avait bloquée.
   * C'est pourtant la seule information dont le titulaire a besoin quand on
   * relit son dossier sans attendre le webhook.
   */
  motifEchec?: string;
}

/** Où consulter les pièces déposées, quand elles sont consultables. */
export interface KycImageUrls {
  documentFrontUrl?: string;
  documentBackUrl?: string;
  selfieUrl?: string;
  /** Vrai si les URLs sont pérennes (stockage maison) plutôt que temporaires. */
  storedInCloudinary?: boolean;
}

/** Ce que le fournisseur a lu sur la pièce d'identité, tel qu'il le rend. */
export interface KycReportData {
  reportId: string;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  nationalite?: string;
  typeDocument?: string;
  numeroDocument?: string;
  dateExpiration?: string;
  documentFrontFileId?: string;
  documentBackFileId?: string;
  selfieFileId?: string;
}

/**
 * Le prestataire de vérification d'identité, vu depuis les use cases.
 *
 * Port de sortie (§4 — DIP) : l'application déclare ce dont elle a besoin,
 * `StripeIdentityAdapter` le rend avec le SDK Stripe. Les use cases injectent
 * {@link IDENTITY_VERIFICATION_PORT}, jamais la classe concrète — c'était
 * pourtant le cas de `PaymentController`, qui injectait `StripeIdentityServiceImpl`
 * en direct (§12.2) alors que le symbole existait déjà, inutilisé.
 *
 * Aucun type Stripe ne traverse cette frontière : `KycReportData` et
 * `KycImageUrls` sont le vocabulaire de ce contexte. Changer de prestataire —
 * ou en tester un en mémoire — est un nouvel adapter, zéro ligne d'application
 * touchée.
 */
export interface IdentityVerificationPort {
  createVerificationSession(
    userId: number,
    email: string,
  ): Promise<VerificationSessionResult>;

  retrieveVerificationSession(
    sessionId: string,
  ): Promise<VerificationSessionResult>;

  cancelVerificationSession(sessionId: string): Promise<void>;

  /** `null` si le fournisseur n'a pas (encore) produit de rapport. */
  extractReportData(sessionId: string): Promise<KycReportData | null>;

  /**
   * Rapatrie une pièce chez nous et rend son URL pérenne. `undefined` en cas
   * d'échec : perdre une image ne doit pas faire échouer une validation.
   */
  downloadAndUploadToCloudinary(
    fileId: string,
    folder: string,
    filename: string,
  ): Promise<string | undefined>;

  getImageUrls(
    reportData: Pick<
      KycReportData,
      'documentFrontFileId' | 'documentBackFileId' | 'selfieFileId'
    >,
  ): Promise<KycImageUrls>;
}
