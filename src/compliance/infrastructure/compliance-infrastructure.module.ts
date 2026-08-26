import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INVESTOR_COMPLIANCE_PROFILE_REPOSITORY } from '../domain/repositories/investor-compliance-profile.repository';
import { InvestorComplianceProfileTypeOrmRepository } from './repositories/investor-compliance-profile.repository';
import { KycInfrastructureModule } from './kyc-infrastructure.module';
import { ProfilesInfrastructureModule } from './profiles-infrastructure.module';
import { KycEntity } from './persistence/entities/kyc.entity';
import { QuestionnaireAdequationEntity } from './persistence/entities/questionnaire-adequation.entity';

/**
 * Adapter de sortie de la **racine** du contexte.
 *
 * `InvestorComplianceProfile` se compose de deux tables qui appartenaient à
 * deux modules d'infrastructure distincts, hérités de l'époque où le dossier de
 * vérification et le questionnaire étaient deux contextes. Ce module est le
 * point où ils se rejoignent : il importe les deux, et publie le seul port par
 * lequel l'éligibilité se charge et s'enregistre d'un bloc (§17).
 *
 * Il déclare lui-même les deux tables : les pièces de la racine — `KycCase` et
 * `AdequacyAssessment` — n'ont plus de repository à elles, et leur persistance
 * ne se délègue donc plus à un port intermédiaire (§6, §10). Ce qu'il réexporte,
 * ce sont les modules voisins pour leurs **lectures** — `DOSSIER_KYC_QUERY` et
 * les ports des profils PP/PM, qui sont, eux, des agrégats de plein droit.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KycEntity, QuestionnaireAdequationEntity]),
    KycInfrastructureModule,
    ProfilesInfrastructureModule,
  ],
  providers: [
    {
      provide: INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
      useClass: InvestorComplianceProfileTypeOrmRepository,
    },
  ],
  exports: [
    INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
    KycInfrastructureModule,
    ProfilesInfrastructureModule,
  ],
})
export class ComplianceInfrastructureModule {}
