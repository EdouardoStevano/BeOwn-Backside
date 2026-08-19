import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilPPEntity } from './persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from './persistences/entities/profil-pm.entity';
import { QuestionnaireAdequationEntity } from './persistences/entities/questionnaire-adequation.entity';
import { ProfilPPTypeOrmRepository } from './persistences/repositories/profil-pp.repository';
import { ProfilPMTypeOrmRepository } from './persistences/repositories/profil-pm.repository';
import { QuestionnaireAdequationTypeOrmRepository } from './persistences/repositories/questionnaire-adequation.repository';
import { PROFIL_PP_REPOSITORY } from '../domains/ports/profil-pp.repository';
import { PROFIL_PM_REPOSITORY } from '../domains/ports/profil-pm.repository';
import { QUESTIONNAIRE_ADEQUATION_REPOSITORY } from '../domains/ports/questionnaire-adequation.repository';

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
    ]),
  ],
  providers: [
    { provide: PROFIL_PP_REPOSITORY, useClass: ProfilPPTypeOrmRepository },
    { provide: PROFIL_PM_REPOSITORY, useClass: ProfilPMTypeOrmRepository },
    {
      provide: QUESTIONNAIRE_ADEQUATION_REPOSITORY,
      useClass: QuestionnaireAdequationTypeOrmRepository,
    },
  ],
  exports: [
    PROFIL_PP_REPOSITORY,
    PROFIL_PM_REPOSITORY,
    QUESTIONNAIRE_ADEQUATION_REPOSITORY,
  ],
})
export class ProfilesInfrastructureModule {}
