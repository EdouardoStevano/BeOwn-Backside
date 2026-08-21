import { Module } from '@nestjs/common';
import { INVESTOR_COMPLIANCE_PROFILE_REPOSITORY } from '../domain/repositories/investor-compliance-profile.repository';
import { InvestorComplianceProfileTypeOrmRepository } from './repositories/investor-compliance-profile.repository';
import { KycInfrastructureModule } from './kyc-infrastructure.module';
import { ProfilesInfrastructureModule } from './profiles-infrastructure.module';

/**
 * Adapter de sortie de la **racine** du contexte.
 *
 * `InvestorComplianceProfile` se compose de deux tables qui appartenaient à
 * deux modules d'infrastructure distincts, hérités de l'époque où le dossier de
 * vérification et le questionnaire étaient deux contextes. Ce module est le
 * point où ils se rejoignent : il importe les deux, et publie le seul port par
 * lequel l'éligibilité se charge et s'enregistre d'un bloc (§17).
 *
 * Il réexporte les deux ports de pièce, que les **lectures partielles**
 * continuent d'utiliser à bon droit : la liste d'administration des dossiers et
 * l'avancement du parcours d'entrée en relation n'ont pas besoin de la racine
 * (§11 — une Query n'a pas à reconstruire un agrégat).
 */
@Module({
  imports: [KycInfrastructureModule, ProfilesInfrastructureModule],
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
