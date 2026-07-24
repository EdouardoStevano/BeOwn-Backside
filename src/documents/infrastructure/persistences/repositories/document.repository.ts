import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { Document } from 'src/documents/domains/document';
import { DocumentType } from 'src/documents/domains/enums/document-type.enum';

@Injectable()
export class DocumentTypeOrmRepository implements DocumentRepository {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
  ) {}

  async save(doc: Document): Promise<Document> {
    const entity = this.repo.create({
      type: doc.type,
      relatedTo: doc.relatedTo,
      userId: doc.userId,
      projectId: doc.projectId,
      investmentId: doc.investmentId,
      originalName: doc.originalName,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      path: doc.path,
      isPublic: doc.isPublic,
      uploadedBy: doc.uploadedBy,
      ordre: doc.ordre ?? null,
      estPrincipale: doc.estPrincipale ?? false,
    });
    const saved = await this.repo.save(entity);
    return this.toDoc(saved);
  }

  async findById(id: string): Promise<Document | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDoc(entity) : null;
  }

  async findByUserId(userId: number): Promise<Document[]> {
    const entities = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDoc(e));
  }

  async findByProjectId(projectId: string): Promise<Document[]> {
    const entities = await this.repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDoc(e));
  }

  async findByInvestmentId(investmentId: string): Promise<Document[]> {
    const entities = await this.repo.find({
      where: { investmentId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDoc(e));
  }

  async findProjectImages(projectId: string): Promise<Document[]> {
    const entities = await this.repo.find({
      where: { projectId, type: DocumentType.PHOTO_PROJET },
      order: { estPrincipale: 'DESC', ordre: 'ASC', createdAt: 'ASC' },
    });
    return entities.map((e) => this.toDoc(e));
  }

  async setMainImage(id: string, projectId: string): Promise<Document> {
    await this.repo.update(
      { projectId, type: DocumentType.PHOTO_PROJET },
      { estPrincipale: false },
    );
    await this.repo.update(id, { estPrincipale: true });
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Document introuvable.');
    return this.toDoc(entity);
  }

  async updateOrdre(id: string, ordre: number): Promise<Document> {
    await this.repo.update(id, { ordre });
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Document introuvable.');
    return this.toDoc(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private toDoc(e: DocumentEntity): Document {
    const doc = new Document();
    doc.id = e.id;
    doc.type = e.type;
    doc.relatedTo = e.relatedTo;
    doc.userId = e.userId;
    doc.projectId = e.projectId;
    doc.investmentId = e.investmentId;
    doc.originalName = e.originalName;
    doc.filename = e.filename;
    doc.mimeType = e.mimeType;
    doc.sizeBytes = e.sizeBytes;
    doc.path = e.path;
    doc.isPublic = e.isPublic;
    doc.uploadedBy = e.uploadedBy;
    doc.ordre = e.ordre;
    doc.estPrincipale = e.estPrincipale;
    doc.createdAt = e.createdAt;
    return doc;
  }
}
