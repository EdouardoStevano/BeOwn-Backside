import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentFiscal } from 'src/regulatory-reporting/domain/document-fiscal';
import { DocumentFiscalRepository } from 'src/regulatory-reporting/domain/repositories/document-fiscal.repository';
import { DocumentFiscalEntity } from '../entities/document-fiscal.entity';
import { DocumentFiscalMapper } from '../mappers/document-fiscal.mapper';

@Injectable()
export class DocumentFiscalTypeOrmRepository implements DocumentFiscalRepository {
  constructor(
    @InjectRepository(DocumentFiscalEntity)
    private readonly repo: Repository<DocumentFiscalEntity>,
  ) {}

  async save(d: DocumentFiscal): Promise<DocumentFiscal> {
    return DocumentFiscalMapper.toDomain(
      await this.repo.save(DocumentFiscalMapper.toEntity(d)),
    );
  }

  async findById(id: string): Promise<DocumentFiscal | null> {
    const f = await this.repo.findOne({ where: { id } });
    return f ? DocumentFiscalMapper.toDomain(f) : null;
  }

  async findByUserEtAnnee(
    userId: number,
    annee: number,
  ): Promise<DocumentFiscal | null> {
    const f = await this.repo.findOne({ where: { userId, annee } });
    return f ? DocumentFiscalMapper.toDomain(f) : null;
  }

  async findByUser(userId: number): Promise<DocumentFiscal[]> {
    const list = await this.repo.find({
      where: { userId },
      order: { annee: 'DESC' },
    });
    return list.map(DocumentFiscalMapper.toDomain);
  }
}
