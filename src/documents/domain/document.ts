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
  createdAt: Date;
}
