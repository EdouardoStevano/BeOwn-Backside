import { DocumentFiscal } from 'src/regulatory-reporting/domain/document-fiscal';
import { DocumentFiscalEntity } from '../entities/document-fiscal.entity';

export class DocumentFiscalMapper {
  static toDomain(e: DocumentFiscalEntity): DocumentFiscal {
    const d = new DocumentFiscal();
    d.id = e.id;
    d.userId = e.userId;
    d.annee = e.annee;
    d.montantBrut = Number(e.montantBrut);
    d.montantIR = Number(e.montantIR);
    d.montantCSG = Number(e.montantCSG);
    d.montantNet = Number(e.montantNet);
    d.pdfUrl = e.pdfUrl;
    d.genereeLe = e.genereeLe;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: DocumentFiscal): DocumentFiscalEntity {
    const e = new DocumentFiscalEntity();
    if (d.id) e.id = d.id;
    e.userId = d.userId;
    e.annee = d.annee;
    e.montantBrut = d.montantBrut;
    e.montantIR = d.montantIR;
    e.montantCSG = d.montantCSG;
    e.montantNet = d.montantNet;
    e.pdfUrl = d.pdfUrl;
    e.genereeLe = d.genereeLe;
    return e;
  }
}
