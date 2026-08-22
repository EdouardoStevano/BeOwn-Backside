import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentFiscalEntity } from './persistence/entities/document-fiscal.entity';
import { DocumentFiscalTypeOrmRepository } from './persistence/repositories/document-fiscal.repository';
import { DOCUMENT_FISCAL_REPOSITORY } from '../domain/repositories/document-fiscal.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentFiscalEntity])],
  providers: [
    {
      provide: DOCUMENT_FISCAL_REPOSITORY,
      useClass: DocumentFiscalTypeOrmRepository,
    },
  ],
  exports: [DOCUMENT_FISCAL_REPOSITORY],
})
export class RegulatoryReportingInfrastructureModule {}
