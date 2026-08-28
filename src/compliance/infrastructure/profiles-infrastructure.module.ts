import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilPPEntity } from './persistence/entities/profil-pp.entity';
import { ProfilPMEntity } from './persistence/entities/profil-pm.entity';
import { QuestionnaireAdequationEntity } from './persistence/entities/questionnaire-adequation.entity';
import { InvestorComplianceProfileEntity } from './persistence/entities/investor-compliance-profile.entity';
import { PieceJustificativeEntity } from './persistence/entities/piece-justificative.entity';
import { BeneficiaireEffectifEntity } from './persistence/entities/beneficiaire-effectif.entity';
import { ProfilPPTypeOrmRepository } from './repositories/profil-pp.repository';
import { ProfilPMTypeOrmRepository } from './repositories/profil-pm.repository';
import { DossierDePiecesTypeOrmRepository } from './repositories/dossier-de-pieces.repository';
import { RegistreDesBeneficiairesTypeOrmRepository } from './repositories/registre-des-beneficiaires.repository';
import { REGISTRE_DES_BENEFICIAIRES_REPOSITORY } from '../domain/repositories/registre-des-beneficiaires.repository';
import { BeneficiairesDeLaSocieteTypeOrmQuery } from './repositories/beneficiaires-de-la-societe.query';
import { CloudPieceJustificativeAdapter } from './external-services/cloud-piece-justificative.adapter';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { PROFIL_PP_REPOSITORY } from '../domain/repositories/profil-pp.repository';
import { PROFIL_PM_REPOSITORY } from '../domain/repositories/profil-pm.repository';
import { DOSSIER_DE_PIECES_REPOSITORY } from '../domain/repositories/dossier-de-pieces.repository';
import { BENEFICIAIRES_DE_LA_SOCIETE_QUERY } from '../application/ports/beneficiaires-de-la-societe.query';
import { PIECE_JUSTIFICATIVE_STORAGE } from '../application/ports/piece-justificative-storage.port';

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
      PieceJustificativeEntity,
      BeneficiaireEffectifEntity,
    ]),
    // Le magasin de fichiers, atteint par le port du contexte : les
    // justificatifs de conformité ont leurs propres règles de conservation et
    // de visibilité, l'adaptateur qui écrit les octets n'en a aucune (§20).
    CloudStorageModule,
  ],
  providers: [
    { provide: PROFIL_PP_REPOSITORY, useClass: ProfilPPTypeOrmRepository },
    { provide: PROFIL_PM_REPOSITORY, useClass: ProfilPMTypeOrmRepository },
    {
      provide: DOSSIER_DE_PIECES_REPOSITORY,
      useClass: DossierDePiecesTypeOrmRepository,
    },
    {
      provide: BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
      useClass: BeneficiairesDeLaSocieteTypeOrmQuery,
    },
    {
      provide: PIECE_JUSTIFICATIVE_STORAGE,
      useClass: CloudPieceJustificativeAdapter,
    },
    {
      provide: REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
      useClass: RegistreDesBeneficiairesTypeOrmRepository,
    },
  ],
  exports: [
    PROFIL_PP_REPOSITORY,
    PROFIL_PM_REPOSITORY,
    DOSSIER_DE_PIECES_REPOSITORY,
    BENEFICIAIRES_DE_LA_SOCIETE_QUERY,
    PIECE_JUSTIFICATIVE_STORAGE,
    REGISTRE_DES_BENEFICIAIRES_REPOSITORY,
  ],
})
export class ProfilesInfrastructureModule {}
