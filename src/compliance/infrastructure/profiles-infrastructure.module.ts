import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilPPEntity } from './persistence/entities/profil-pp.entity';
import { ProfilPMEntity } from './persistence/entities/profil-pm.entity';
import { QuestionnaireAdequationEntity } from './persistence/entities/questionnaire-adequation.entity';
import { InvestorComplianceProfileEntity } from './persistence/entities/investor-compliance-profile.entity';
import { ProfilPPTypeOrmRepository } from './repositories/profil-pp.repository';
import { ProfilPMTypeOrmRepository } from './repositories/profil-pm.repository';
import { PROFIL_PP_REPOSITORY } from '../domain/repositories/profil-pp.repository';
import { PROFIL_PM_REPOSITORY } from '../domain/repositories/profil-pm.repository';

/**
 * Câblage des adapters de sortie du contexte Profiles (§4 — DIP) : un port par
 * agrégat, une implémentation TypeORM pour chacun.
 *
 * Le dossier KYC n'en fait plus partie : il a son propre contexte, et donc son
 * propre `KycInfrastructureModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfilPPEntity,
      ProfilPMEntity,
      QuestionnaireAdequationEntity,
      InvestorComplianceProfileEntity,
    ]),
  ],
  providers: [
    { provide: PROFIL_PP_REPOSITORY, useClass: ProfilPPTypeOrmRepository },
    { provide: PROFIL_PM_REPOSITORY, useClass: ProfilPMTypeOrmRepository },
  ],
  exports: [PROFIL_PP_REPOSITORY, PROFIL_PM_REPOSITORY],
})
export class ProfilesInfrastructureModule {}
