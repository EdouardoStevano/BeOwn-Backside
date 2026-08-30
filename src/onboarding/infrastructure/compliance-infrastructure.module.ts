import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DOSSIER_ENTREE_EN_RELATION_REPOSITORY } from '../domain/repositories/dossier-d-entree-en-relation.repository';
import { DossierDEntreeEnRelationTypeOrmRepository } from './repositories/dossier-d-entree-en-relation.repository';
import { ProfilConformiteTypeOrmQuery } from './repositories/profil-conformite.query';
import { PROFIL_CONFORMITE_QUERY } from '../application/ports/profil-conformite.query';
import { InvestorComplianceProfileEntity } from './persistence/entities/investor-compliance-profile.entity';
import { AdequacyInfrastructureModule } from 'src/adequacy/infrastructure/adequacy-infrastructure.module';
import { KycInfrastructureModule } from './kyc-infrastructure.module';
import { ProfilesInfrastructureModule } from './profiles-infrastructure.module';
import { KycEntity } from './persistence/entities/kyc.entity';

/**
 * Adapter de sortie de la **racine** du contexte d'entrée en relation.
 *
 * `DossierDEntreeEnRelation` porte le dossier de vérification et le verdict
 * KYB ; il déclare lui-même la table de `KycCase`, qui est sa pièce et n'a donc
 * pas de repository à elle (§6, §10).
 *
 * **L'évaluation d'adéquation a quitté ce module** avec son contexte. Il n'en
 * reste qu'une lecture — `CLASSEMENT_DU_TITULAIRE_QUERY`, importée
 * d'`AdequacyInfrastructureModule` — dont `ProfilConformiteTypeOrmQuery` a
 * besoin pour composer l'éligibilité que publie `PROFIL_CONFORMITE_QUERY`.
 *
 * Ce qu'il réexporte, ce sont les modules voisins pour leurs **lectures** —
 * `DOSSIER_KYC_QUERY` et les ports des profils PP/PM, qui sont, eux, des
 * agrégats de plein droit.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KycEntity, InvestorComplianceProfileEntity]),
    KycInfrastructureModule,
    ProfilesInfrastructureModule,
    // Le classement PSFP, par le port du contexte voisin : `ProfilConformiteTypeOrmQuery`
    // le compose avec l'aptitude à opérer pour rendre une éligibilité d'un seul
    // tenant. Seule arête vers l'adéquation, et elle ne va que dans ce sens.
    AdequacyInfrastructureModule,
  ],
  providers: [
    DossierDEntreeEnRelationTypeOrmRepository,
    {
      provide: DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
      useClass: DossierDEntreeEnRelationTypeOrmRepository,
    },
    // La lecture que les contextes financiers en aval font du dossier : peut-il
    // opérer, et jusqu'où. Elle croise les deux contextes, et c'est ce qui leur
    // évite d'en connaître deux pour une seule décision.
    {
      provide: PROFIL_CONFORMITE_QUERY,
      useClass: ProfilConformiteTypeOrmQuery,
    },
  ],
  exports: [
    DOSSIER_ENTREE_EN_RELATION_REPOSITORY,
    PROFIL_CONFORMITE_QUERY,
    KycInfrastructureModule,
    ProfilesInfrastructureModule,
    // Réexporté pour `GetOnboardingStatusUseCase`, qui lit l'avancement du
    // questionnaire par `AVANCEMENT_DU_QUESTIONNAIRE_QUERY`.
    AdequacyInfrastructureModule,
  ],
})
export class ComplianceInfrastructureModule {}
