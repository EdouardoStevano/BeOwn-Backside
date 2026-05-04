import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'path';
import { DocumentsInfrastructureModule } from '../infrastructure/documents-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { DocumentController } from '../presenters/http/document.controller';

@Module({
  imports: [
    DocumentsInfrastructureModule,
    IamInfrastructureModule,
    MulterModule.register({ dest: join(process.cwd(), 'uploads') }),
  ],
  controllers: [DocumentController],
})
export class DocumentsModule {}
