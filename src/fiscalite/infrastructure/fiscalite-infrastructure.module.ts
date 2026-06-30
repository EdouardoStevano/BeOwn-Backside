import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentFiscalEntity } from './persistences/entities/document-fiscal.entity';
import { DocumentFiscalTypeOrmRepository } from './persistences/repositories/document-fiscal.repository';
import { DOCUMENT_FISCAL_REPOSITORY } from '../applications/ports/repositories/document-fiscal.repository';

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
export class FiscaliteInfrastructureModule {}
