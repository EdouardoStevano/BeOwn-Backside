import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { DOSSIER_KYC_QUERY } from '../application/ports/dossier-kyc.query';
import { IDENTITY_VERIFICATION_PORT } from '../application/ports/identity-verification.port';
import { KycEntity } from './persistence/entities/kyc.entity';
import { DossierKycTypeOrmQuery } from './repositories/dossier-kyc.query';
import { StripeIdentityAdapter } from './external-services/stripe-identity.adapter';

/**
 * Câblage des adapters de sortie du contexte KYC (§4 — DIP) : la persistance du
 * dossier, et le prestataire qui vérifie les pièces.
 *
 * Séparé de `KycModule` pour la même raison que `ProfilesInfrastructureModule`
 * l'est de `ProfilesModule` : les contextes qui n'ont besoin que de **lire** un
 * dossier — Account Overview pour la vue compte — importent celui-ci et
 * n'embarquent ni les contrôleurs, ni les abonnés aux événements, ni le SDK
 * Stripe (§5 — CRP).
 *
 * Ce qu'il exporte pour cela est un **port de lecture**, `DOSSIER_KYC_QUERY`,
 * et non plus un repository. `KYC_REPOSITORY` donnait à ses importateurs — y
 * compris au contexte `iam` — un `KycCase` vivant, c'est-à-dire une entité
 * interne au dossier de conformité, avec ses transitions. L'écriture passe
 * désormais par la racine seule (§6, §10).
 */
@Module({
  imports: [
    ConfigModule,
    CloudStorageModule,
    TypeOrmModule.forFeature([KycEntity]),
  ],
  providers: [
    { provide: DOSSIER_KYC_QUERY, useClass: DossierKycTypeOrmQuery },
    { provide: IDENTITY_VERIFICATION_PORT, useClass: StripeIdentityAdapter },
  ],
  exports: [DOSSIER_KYC_QUERY, IDENTITY_VERIFICATION_PORT],
})
export class KycInfrastructureModule {}
