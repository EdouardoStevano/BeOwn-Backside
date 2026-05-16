import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './news.entity';
import { AdminNewsController, PublicNewsController } from './news.controller';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { IamModule } from 'src/iam/iam.module';

@Module({
  imports: [TypeOrmModule.forFeature([NewsEntity, UserEntity]), IamModule],
  controllers: [PublicNewsController, AdminNewsController],
})
export class NewsModule {}
