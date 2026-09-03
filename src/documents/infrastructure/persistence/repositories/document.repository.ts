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
