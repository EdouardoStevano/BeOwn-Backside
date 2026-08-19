import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { KYC_REPOSITORY } from '../domains/ports/kyc.repository';
import { IDENTITY_VERIFICATION_PORT } from '../applications/ports/identity-verification.port';
import { KycEntity } from './persistences/entities/kyc.entity';
import { KycTypeOrmRepository } from './persistences/repositories/kyc.repository';
import { StripeIdentityAdapter } from './stripe-identity.adapter';

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
