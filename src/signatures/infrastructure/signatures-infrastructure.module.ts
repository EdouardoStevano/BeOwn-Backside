import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignatureEntity } from './persistences/entities/signature.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SignatureEntity])],
  exports: [TypeOrmModule],
})
export class SignaturesInfrastructureModule {}
