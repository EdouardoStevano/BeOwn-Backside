import { SignatureStatus } from './enums/signature-status.enum';

export class Signature {
  id: string;
  youSignRequestId: string;
  youSignSignerId: string;
  youSignSigningUrl: string | null;
  documentId: string;
  investmentId: string | null;
  ordreId: string | null;
  nbFractions: number | null;
  userId: number;
  statut: SignatureStatus;
  /** Implémentation du port SignatureProvider ('yousign' | 'acknowledge'). */
  provider: string;
  /** Empreinte SHA-256 du PDF présenté — parcours de repli uniquement. */
  documentHash: string | null;
  /** Horodatage serveur de l'acceptation certifiée — repli uniquement. */
  acknowledgedAt: Date | null;
  /** IP du signataire à l'acceptation — repli uniquement. */
  acknowledgedIp: string | null;
  /** Certificat d'acceptation archivé (module documents) — repli uniquement. */
  certificatDocumentId: string | null;
  expiresAt: Date;
  signedAt: Date | null;
  createdAt: Date;
}
