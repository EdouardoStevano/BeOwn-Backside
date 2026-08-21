import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { KYC_REPOSITORY } from '../domain/repositories/kyc.repository';
import { IDENTITY_VERIFICATION_PORT } from '../application/ports/identity-verification.port';
import { KycEntity } from './persistence/entities/kyc.entity';
import { KycTypeOrmRepository } from './repositories/kyc.repository';
import { StripeIdentityAdapter } from './external-services/stripe-identity.adapter';

/**
 * Câblage des adapters de sortie du contexte KYC (§4 — DIP) : la persistance du
 * dossier, et le prestataire qui vérifie les pièces.
 *
 * Séparé de `KycModule` pour la même raison que `ProfilesInfrastructureModule`
 * l'est de `ProfilesModule` : les contextes qui n'ont besoin que de **lire** un
 * dossier — Profiles pour l'avancement de l'onboarding, Account Overview pour
 * la vue compte — importent celui-ci et n'embarquent ni les contrôleurs, ni les
 * abonnés aux événements, ni le SDK Stripe (§5 — CRP).
 */
@Module({
  imports: [
    ConfigModule,
    CloudStorageModule,
    TypeOrmModule.forFeature([KycEntity]),
  ],
  providers: [
    { provide: KYC_REPOSITORY, useClass: KycTypeOrmRepository },
    { provide: IDENTITY_VERIFICATION_PORT, useClass: StripeIdentityAdapter },
  ],
  exports: [KYC_REPOSITORY, IDENTITY_VERIFICATION_PORT],
})
export class KycInfrastructureModule {}
