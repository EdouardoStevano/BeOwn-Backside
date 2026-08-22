import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ComplianceInfrastructureModule } from '../infrastructure/compliance-infrastructure.module';
import { KycInfrastructureModule } from '../infrastructure/kyc-infrastructure.module';
import { CreateKycUseCase } from './usecases/kyc/create-kyc.usecase';
import { GetKycUseCase } from './usecases/kyc/get-kyc.usecase';
import { GetKycImagesUseCase } from './usecases/kyc/get-kyc-images.usecase';
import { UpdateKycStatusUseCase } from './usecases/kyc/update-kyc-status.usecase';
import { RequestKycManualReviewUseCase } from './usecases/kyc/request-kyc-manual-review.usecase';
import { DecideKycManualReviewUseCase } from './usecases/kyc/decide-kyc-manual-review.usecase';
import { StartKycSessionUseCase } from './usecases/kyc/start-kyc-session.usecase';
import { ConsultKycSessionUseCase } from './usecases/kyc/consult-kyc-session.usecase';
import { HandleIdentityWebhookUseCase } from './usecases/kyc/handle-identity-webhook.usecase';
import { KycValideEventHandler } from './handlers/kyc-valide.event-handler';
import { KycRefuseEventHandler } from './handlers/kyc-refuse.event-handler';
import { KycRevueManuelleDemandeeEventHandler } from './handlers/kyc-revue-manuelle-demandee.event-handler';
import { KycController } from '../presentation/http/kyc.controller';
import {
  KycLegacyPaymentsController,
  KycLegacyProfilesController,
} from '../presentation/http/kyc-legacy.controller';
import { KycValidatedGuard } from '../presentation/guards/kyc-validated.guard';
import { ComplianceErrorFilter } from '../presentation/http/filters/compliance-error.filter';

/**
 * Bounded Context « vérification d'identité ».
 *
 * Il était réparti entre Profiles (agrégat, use cases, événements, décision
 * manuelle) et Payments (session Stripe Identity, webhooks, images), sans
 * qu'aucun profil ni aucun paiement n'ait de règle à partager avec lui : la
 * seule chose que les deux contextes lisaient du dossier, c'est son statut.
 * Réunir tout ce qui change pour la même raison dans un seul module, c'est
 * exactement ce que CCP demande (§5).
 *
 * **Ce module ne dépend ni de Profiles ni de Payments.** La flèche va dans
 * l'autre sens : Payments lui délègue les événements `identity.*` de son
 * webhook Stripe, Profiles lui demande le dossier pour composer l'avancement de
 * l'onboarding. Les seuls contextes dont il dépend sont IAM (identité du compte,
 * par son port) et Notifications (annonces et audit), tous deux amont.
 */
@Module({
  imports: [
    // Bus d'événements du contexte : les use cases y publient les faits métier
    // (revue demandée, dossier validé, dossier refusé), les handlers de
    // `applications/events/` s'y abonnent (§8).
    CqrsModule,
    KycInfrastructureModule,
    // `INVESTOR_COMPLIANCE_PROFILE_REPOSITORY` : `KycValidatedGuard` demande à
    // la racine si le titulaire peut opérer, il ne lit plus le dossier seul.
    ComplianceInfrastructureModule,
    // `TokenService` pour le JwtAuthGuard monté par les contrôleurs.
    IamInfrastructureModule,
    // `USER_REPOSITORY` : la liste d'administration affiche le titulaire de
    // chaque dossier, et la décision manuelle relit le rôle de l'appelant.
    UsersInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    CreateKycUseCase,
    GetKycUseCase,
    GetKycImagesUseCase,
    UpdateKycStatusUseCase,
    RequestKycManualReviewUseCase,
    DecideKycManualReviewUseCase,
    StartKycSessionUseCase,
    ConsultKycSessionUseCase,
    HandleIdentityWebhookUseCase,
    KycValideEventHandler,
    KycRefuseEventHandler,
    KycRevueManuelleDemandeeEventHandler,
    KycValidatedGuard,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§12.1), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ComplianceErrorFilter },
  ],
  controllers: [
    KycController,
    // À retirer avec le fichier le jour où le front n'appelle plus
    // `/profiles/kyc/*` ni `/payments/kyc/*`.
    KycLegacyProfilesController,
    KycLegacyPaymentsController,
  ],
  exports: [
    // Payments délègue ici les événements `identity.*` de son webhook Stripe.
    HandleIdentityWebhookUseCase,
    // Monté par Investments, Reservations, SecondaryMarket et Payments sur les
    // routes qui exigent un dossier validé.
    KycValidatedGuard,
    // Avec son port. Un garde référencé par `@UseGuards(KycValidatedGuard)` est
    // instancié par Nest dans le module du **contrôleur**, pas dans celui qui le
    // déclare : `INVESTOR_COMPLIANCE_PROFILE_REPOSITORY` doit donc être visible
    // depuis les quatre contextes consommateurs. Sans ce réexport, chacun devrait
    // importer lui-même l'infrastructure de `compliance` pour poser le garde —
    // exactement la connaissance de la table d'un autre contexte que le garde a
    // été refait pour supprimer (§13).
    ComplianceInfrastructureModule,
    // Par réexport : le port du dossier, pour les contextes qui composent avec
    // (Profiles, Account Overview).
    KycInfrastructureModule,
  ],
})
export class KycModule {}
