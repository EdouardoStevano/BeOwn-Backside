import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { DocumentOrmMapper } from '../mappers/document.orm-mapper';
import type { DocumentRepository } from 'src/documents/domain/repositories/document.repository';
import type {
  SignableDocument,
  SignableDocumentNaissant,
} from 'src/documents/domain/aggregates/signable-document';
import { DocumentIntrouvableError } from 'src/documents/domain/errors';
import { DocumentType } from 'src/documents/domain/enums/document-type.enum';

/** L'adapter TypeORM du port `DocumentRepository` (§33). */
@Injectable()
export class DocumentTypeOrmRepository implements DocumentRepository {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
  ) {}

  async creer(naissant: SignableDocumentNaissant): Promise<SignableDocument> {
    const saved = await this.repo.save(
      DocumentOrmMapper.naissantToEntity(naissant),
    );
    return DocumentOrmMapper.toDomain(saved);
  }

  async save(document: SignableDocument): Promise<SignableDocument> {
    const saved = await this.repo.save(DocumentOrmMapper.toEntity(document));
    return DocumentOrmMapper.toDomain(saved);
  }

  async findById(id: string): Promise<SignableDocument | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? DocumentOrmMapper.toDomain(entity) : null;
  }

  async findByUserId(userId: number): Promise<SignableDocument[]> {
    return this.lire({ userId });
  }

  async findByProjectId(projectId: string): Promise<SignableDocument[]> {
    return this.lire({ projectId });
  }

  async findByInvestmentId(investmentId: string): Promise<SignableDocument[]> {
    return this.lire({ investmentId });
  }

  async findProjectImages(projectId: string): Promise<SignableDocument[]> {
    const entities = await this.repo.find({
      where: { projectId, type: DocumentType.PHOTO_PROJET },
      order: { estPrincipale: 'DESC', ordre: 'ASC', createdAt: 'ASC' },
    });
    return entities.map(DocumentOrmMapper.toDomain);
  }

  /**
   * Deux écritures, une intention : l'unicité de la couverture porte sur
   * toutes les photos du projet, pas sur le document seul (voir le port).
   */
  async designerImagePrincipale(
    document: SignableDocument,
  ): Promise<SignableDocument> {
    const { id, projectId } = document.snapshot();
    await this.repo.update(
      { projectId: projectId!, type: DocumentType.PHOTO_PROJET },
      { estPrincipale: false },
    );
    await this.repo.update(id, { estPrincipale: true });

    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new DocumentIntrouvableError(id);
    return DocumentOrmMapper.toDomain(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private async lire(
    where: Record<string, unknown>,
  ): Promise<SignableDocument[]> {
    const entities = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return entities.map(DocumentOrmMapper.toDomain);
  }
}
