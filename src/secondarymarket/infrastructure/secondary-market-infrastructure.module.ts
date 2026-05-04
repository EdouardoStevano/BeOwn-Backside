import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdreMarcheEntity } from './persistences/entities/ordre-marche.entity';

export const ORDRE_MARCHE_REPOSITORY = Symbol('ORDRE_MARCHE_REPOSITORY');

@Module({
  imports: [TypeOrmModule.forFeature([OrdreMarcheEntity])],
  exports: [TypeOrmModule],
})
export class SecondaryMarketInfrastructureModule {}
