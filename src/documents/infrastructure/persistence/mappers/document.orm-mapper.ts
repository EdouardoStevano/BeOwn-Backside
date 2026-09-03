import {
  SignableDocument,
  type SignableDocumentNaissant,
} from 'src/documents/domain/aggregates/signable-document';
import { DocumentEntity } from '../entities/document.entity';

/**
 * Traduit entre l'agrégat du domaine et les lignes TypeORM (§16).
 *
 * Ce mapping vivait en deux méthodes privées du repository — `toDoc` et un
 * `repo.create({...})` — qui posaient les champs un à un sur une instance
 * vide, ce que l'état privé de l'agrégat n'autorise plus.
 *
 * Le nom de l'entité reste `DocumentEntity` : elle porte la table `document`,
 * et le modèle de persistance n'a pas à suivre le nom du modèle de domaine.
 */
export class DocumentOrmMapper {
  static toDomain(entity: DocumentEntity): SignableDocument {
    return new SignableDocument({
      id: entity.id,
      type: entity.type,
      relatedTo: entity.relatedTo,
      userId: entity.userId,
      projectId: entity.projectId,
      investmentId: entity.investmentId,
      originalName: entity.originalName,
      filename: entity.filename,
      mimeType: entity.mimeType,
      sizeBytes: Number(entity.sizeBytes),
      path: entity.path,
      isPublic: entity.isPublic,
      uploadedBy: entity.uploadedBy,
      createdAt: entity.createdAt,
    });
  }

  /** Une ligne prête à être insérée, pour un document qui vient d'être déposé. */
  static naissantToEntity(naissant: SignableDocumentNaissant): DocumentEntity {
    const entity = new DocumentEntity();
    entity.type = naissant.type;
    entity.relatedTo = naissant.relatedTo;
    entity.userId = naissant.userId;
    entity.projectId = naissant.projectId;
    entity.investmentId = naissant.investmentId;
    entity.originalName = naissant.originalName;
    entity.filename = naissant.filename;
    entity.mimeType = naissant.mimeType;
    entity.sizeBytes = naissant.sizeBytes;
    entity.path = naissant.path;
    entity.isPublic = naissant.isPublic;
    entity.uploadedBy = naissant.uploadedBy;
    return entity;
  }

  /** La ligne correspondant à un agrégat existant, identité comprise. */
  static toEntity(document: SignableDocument): DocumentEntity {
    const etat = document.snapshot();
    const entity = DocumentOrmMapper.naissantToEntity(etat);
    entity.id = etat.id;
    return entity;
  }
}
