import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './persistences/entities/document.entity';
import { DocumentTypeOrmRepository } from './persistences/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from '../applications/ports/repositories/document.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentTypeOrmRepository },
  ],
  exports: [DOCUMENT_REPOSITORY],
})
export class DocumentsInfrastructureModule {}
