import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { DocumentsInfrastructureModule } from '../infrastructure/documents-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { DocumentController } from '../presenters/http/document.controller';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';

@Module({
  imports: [
    DocumentsInfrastructureModule,
    IamInfrastructureModule,
    CloudStorageModule,
    TypeOrmModule.forFeature([ProjectEntity, InvestmentEntity]),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [DocumentController],
})
export class DocumentsModule {}
