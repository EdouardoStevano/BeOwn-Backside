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
  expiresAt: Date;
  signedAt: Date | null;
  createdAt: Date;
}
