import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './news.entity';
import { AdminNewsController, PublicNewsController } from './news.controller';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamModule } from 'src/iam/iam.module';
import { CloudStorageModule } from 'src/common/cloud-storage/cloud-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsEntity, UserEntity]),
    IamModule,
    CloudStorageModule,
  ],
  controllers: [PublicNewsController, AdminNewsController],
})
export class NewsModule {}
