import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignaturesInfrastructureModule } from '../infrastructure/signatures-infrastructure.module';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { SignatureProviderModule } from '../infrastructure/signature-provider.module';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { SignaturesController } from '../presenters/http/signatures.controller';
import { FinalizeSignedContractUseCase } from './usecases/finalize-signed-contract.usecase';
import { AcknowledgeSignatureUseCase } from './usecases/acknowledge-signature.usecase';
import { GetSignatureContextUseCase } from './usecases/get-signature-context.usecase';
import { CertificatAcceptationService } from './certificat-acceptation.service';

/**
 * Domaine signatures — règlement des contrats signés et parcours d'acceptation
 * certifiée (provider de repli).
 *
 * `FinalizeSignedContractUseCase` est partagé par les DEUX chemins de recueil
 * du consentement : le webhook YouSign (SecondaryMarketModule) et
 * `POST /signatures/:requestId/acknowledge`. `PlatformFeesModule` et le module
 * métriques sont globaux : aucun import supplémentaire.
 */
@Module({
  imports: [
    SignaturesInfrastructureModule,
    TypeOrmModule.forFeature([
      OrdreMarcheEntity,
      ProjectEntity,
      DocumentEntity,
      UserEntity,
      UserEmailEntity,
      // KycValidatedGuard : l'acceptation est une action financière, gatée KYC.
      KycEntity,
    ]),
    IamInfrastructureModule,
    // USER_REPOSITORY (port iam) — consommé par FinalizeSignedContractUseCase.
    UsersInfrastructureModule,
    NotificationsModule,
    CloudStorageModule,
    SignatureProviderModule,
  ],
  providers: [
    FinalizeSignedContractUseCase,
    AcknowledgeSignatureUseCase,
    GetSignatureContextUseCase,
    CertificatAcceptationService,
    KycValidatedGuard,
  ],
  controllers: [SignaturesController],
  exports: [FinalizeSignedContractUseCase],
})
export class SignaturesModule {}
