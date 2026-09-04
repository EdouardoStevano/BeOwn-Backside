/**
 * Port du prestataire de signature (DIP) — abstract class servant à la fois
 * d'abstraction et de token d'injection NestJS.
 *
 * Deux adapters l'implémentent :
 *  - `YouSignService` (signature électronique embarquée, prestataire externe) ;
 *  - `SimpleAcknowledgementProvider` (repli « acceptation certifiée » : aucun
 *    prestataire — horodatage serveur + IP + empreinte SHA-256 du document,
 *    recueillis par `POST /signatures/:requestId/acknowledge`).
 *
 * La sélection se fait au câblage par la variable d'environnement
 * `SIGNATURE_PROVIDER` (`yousign` par défaut, `acknowledge` pour le repli) —
 * voir `SignatureProviderModule`. Le métier ne connaît que ce contrat.
 *
 * ISP : le port ne porte QUE le cycle de vie d'une demande de signature.
 * La vérification d'authenticité des webhooks YouSign reste sur
 * `YouSignService` — elle n'a de sens que pour ce prestataire et n'est
 * consommée que par son presenter dédié.
 */

/** Noms bornés des implémentations — persistés sur la ligne signature. */
export type SignatureProviderName = 'yousign' | 'acknowledge';

export interface CreateEmbeddedSignatureParams {
  documentBuffer: Buffer;
  documentName: string;
  signerEmail: string;
  signerFirstname: string;
  signerLastname: string;
  expiresAt?: Date;
  successRedirectUrl?: string;
  errorRedirectUrl?: string;
}

export interface EmbeddedSignatureResult {
  requestId: string;
  signerId: string;
  signingUrl: string;
  /** Implémentation qui a ouvert la demande — persisté pour router l'acknowledge. */
  provider: SignatureProviderName;
  /**
   * Empreinte SHA-256 (hex) du PDF présenté au signataire. Renseignée par le
   * provider de repli (élément de preuve du certificat d'acceptation) ; null
   * côté YouSign, dont la valeur probatoire repose sur le dossier de preuve
   * du prestataire.
   */
  documentHash: string | null;
}

export abstract class SignatureProvider {
  abstract createEmbeddedSignatureRequest(
    params: CreateEmbeddedSignatureParams,
  ): Promise<EmbeddedSignatureResult>;

  /** Exemplaire définitif du document une fois la signature recueillie. */
  abstract downloadSignedDocument(requestId: string): Promise<Buffer>;

  /**
   * Clôt la demande côté prestataire. Best-effort : la transition de statut
   * interne (CANCELLED/EXPIRED) appartient aux use cases, jamais au provider.
   */
  abstract cancelSignatureRequest(requestId: string): Promise<void>;

  abstract getSignatureRequestStatus(requestId: string): Promise<string>;
}
