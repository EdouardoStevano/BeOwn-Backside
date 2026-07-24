import { DocumentFiscal } from '../../../domains/document-fiscal';

export const DOCUMENT_FISCAL_REPOSITORY = Symbol('DOCUMENT_FISCAL_REPOSITORY');

export interface DocumentFiscalRepository {
  save(d: DocumentFiscal): Promise<DocumentFiscal>;
  findById(id: string): Promise<DocumentFiscal | null>;
  findByUserEtAnnee(
    userId: number,
    annee: number,
  ): Promise<DocumentFiscal | null>;
  findByUser(userId: number): Promise<DocumentFiscal[]>;
}
