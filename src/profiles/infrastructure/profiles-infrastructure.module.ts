import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilPPEntity } from './persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from './persistences/entities/profil-pm.entity';
import { KycEntity } from './persistences/entities/kyc.entity';
import { ProfilPPTypeOrmRepository } from './persistences/repositories/profil-pp.repository';
import { ProfilPMTypeOrmRepository } from './persistences/repositories/profil-pm.repository';
import { KycTypeOrmRepository } from './persistences/repositories/kyc.repository';
import { PROFIL_PP_REPOSITORY } from '../domains/ports/profil-pp.repository';
import { PROFIL_PM_REPOSITORY } from '../domains/ports/profil-pm.repository';
import { KYC_REPOSITORY } from '../domains/ports/kyc.repository';

/**
 * Câblage des adapters de sortie du contexte Profiles (§4 — DIP) : un port par
 * agrégat, une implémentation TypeORM pour chacun.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProfilPPEntity, ProfilPMEntity, KycEntity]),
  ],
  providers: [
    { provide: PROFIL_PP_REPOSITORY, useClass: ProfilPPTypeOrmRepository },
    { provide: PROFIL_PM_REPOSITORY, useClass: ProfilPMTypeOrmRepository },
    { provide: KYC_REPOSITORY, useClass: KycTypeOrmRepository },
  ],
  exports: [PROFIL_PP_REPOSITORY, PROFIL_PM_REPOSITORY, KYC_REPOSITORY],
})
export class ProfilesInfrastructureModule {}
