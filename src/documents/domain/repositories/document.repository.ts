import { Document } from 'src/documents/domain/document';

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export interface DocumentRepository {
  save(doc: Document): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  findByUserId(userId: number): Promise<Document[]>;
  findByProjectId(projectId: string): Promise<Document[]>;
  findByInvestmentId(investmentId: string): Promise<Document[]>;
  findProjectImages(projectId: string): Promise<Document[]>;
  setMainImage(id: string, projectId: string): Promise<Document>;
  updateOrdre(id: string, ordre: number): Promise<Document>;
  delete(id: string): Promise<void>;
}
