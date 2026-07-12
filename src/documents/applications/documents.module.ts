import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsInfrastructureModule } from '../infrastructure/documents-infrastructure.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';
import { DocumentController } from '../presenters/http/document.controller';

@Module({
  imports: [
    DocumentsInfrastructureModule,
    CloudStorageModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [DocumentController],
})
export class DocumentsModule {}
