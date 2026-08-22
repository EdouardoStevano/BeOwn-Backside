import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './persistence/entities/document.entity';
import { SignatureEntity } from './persistence/entities/signature.entity';
import { DocumentTypeOrmRepository } from './persistence/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from '../domain/repositories/document.repository';

/**
 * Adapters de sortie du contexte Documents.
 *
 * Il enregistre les deux tables du contexte — le document et sa demande de
 * signature. `SignaturesInfrastructureModule` les séparait ; il n'était importé
 * par personne, chaque contexte consommateur déclarant `SignatureEntity` dans
 * son propre `forFeature`. La signature est publiée ici, à côté du document
 * qu'elle fait signer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity, SignatureEntity])],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentTypeOrmRepository },
  ],
  exports: [DOCUMENT_REPOSITORY, TypeOrmModule],
})
export class DocumentsInfrastructureModule {}
