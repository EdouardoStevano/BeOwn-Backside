import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilPPEntity } from './persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from './persistences/entities/profil-pm.entity';
import { KycEntity } from './persistences/entities/kyc.entity';
import { ProfilTypeOrmRepository } from './persistences/repositories/profil.repository';
import { PROFIL_REPOSITORY } from '../applications/ports/repositories/profil.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfilPPEntity, ProfilPMEntity, KycEntity]),
  ],
  providers: [
    { provide: PROFIL_REPOSITORY, useClass: ProfilTypeOrmRepository },
  ],
  exports: [PROFIL_REPOSITORY],
})
export class ProfilesInfrastructureModule {}
