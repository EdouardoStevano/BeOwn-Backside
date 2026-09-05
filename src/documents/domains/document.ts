import { DocumentRelatedTo, DocumentType } from './enums/document-type.enum';

export class Document {
  id: string;
  type: DocumentType;
  relatedTo: DocumentRelatedTo;
  userId: number | null;
  projectId: string | null;
  investmentId: string | null;
  originalName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  isPublic: boolean;
  uploadedBy: number;
  ordre: number | null;
  estPrincipale: boolean;
  /**
   * Pièce placée en archivage restreint RGPD/LCB-FT : dossier KYC d'un compte
   * supprimé, conservé cinq ans après la clôture (art. L. 561-12 CMF) puis
   * purgé par le cron RGPD.
   *
   * Remonté jusqu'au domaine parce que la restriction d'accès est APPLICATIVE
   * (barème § 2.3) : sans ce champ, la couche de présentation ne pouvait pas
   * distinguer une pièce archivée d'une pièce courante, et le marqueur posé en
   * base n'était filtré par aucune lecture.
   */
  archiveConservationLegale: boolean;
  createdAt: Date;
}
