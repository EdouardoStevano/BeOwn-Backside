import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TreasuryInfrastructureModule } from './infrastructure/treasury-infrastructure.module';
import { WalletController } from './presentation/http/wallet.controller';
import { PaymentController } from './presentation/http/payment.controller';
import { RequestRetraitUseCase } from './application/usecases/request-retrait.usecase';
import { PAYMENT_GATEWAY } from './application/ports/payment.gateway';
import { StripePaymentAdapter } from './infrastructure/external-services/stripe-payment.adapter';
import { StripeConnectAdapter } from './infrastructure/external-services/stripe-connect.adapter';
import { TreasuryErrorFilter } from './presentation/http/filters/treasury-error.filter';
import { WalletEntity } from './infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from './infrastructure/persistence/entities/transaction.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { KycModule } from 'src/compliance/application/kyc.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

/**
 * Bounded Context **Treasury** (§3.2, M7) : la trésorerie de la plateforme —
 * les wallets, les mouvements de fonds qui les traversent (MoneyIn, MoneyOut,
 * MassPay) et la réconciliation.
 *
 * **Un seul module là où il y en avait deux.** `WalletsModule` détenait les
 * portefeuilles et `PaymentsModule` les dépôts, retraits et le webhook Stripe :
 * deux modules techniques pour une seule capacité métier. Le cahier des charges
 * les réunit sous M7, et §3.1 tranche le reste — le paiement bas niveau est
 * **Generic**, acheté chez Stripe, « à isoler derrière des Anti-Corruption
 * Layers, jamais reconstruit ». Ce n'était donc pas un Bounded Context
 * concurrent, mais l'adaptateur de sortie de celui-ci. Le découper en deux
 * revenait à faire passer une frontière de contexte au milieu d'un virement.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `reservation` (HOLD des fonds), de `subscription` (débit à la
 *   souscription, recrédit à la rétractation) et de `servicing` (MassPay des
 *   coupons) — ces contextes déclenchent les mouvements, ce contexte les tient ;
 * - **Conformist** vis-à-vis de Stripe, dont BeOwn adopte le modèle de wallets
 *   et de webhooks, mais protégé par une **Anti-Corruption Layer** (§20) : le
 *   port `PaymentGateway` et ses adaptateurs `StripePaymentAdapter` /
 *   `StripeConnectAdapter` sont la seule frontière par laquelle Stripe entre.
 *
 * Ce module donne au contexte son nom et sa forme (§5) ; le modèle riche
 * (`Wallet` en agrégat protégeant son solde, `Money`, erreurs de domaine,
 * événements) est l'étape suivante — même découpage en deux temps que
 * `catalog` et `subscription`.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `PaymentController` et `RequestRetraitUseCase` manipulent directement les
 *   entités ORM et l'`EntityManager` : la logique financière du dépôt et du
 *   retrait vit encore dans la couche application, pas dans l'agrégat ;
 * - le module enregistre `UserEntity`, entité d'un autre contexte, pour la
 *   résolution du compte Stripe Connect d'un investisseur.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, UserEntity]),
    TreasuryInfrastructureModule,
    IamInfrastructureModule,
    // `KycValidatedGuard` : déposer et retirer exigent un dossier vérifié ;
    // `HandleIdentityWebhookUseCase`, à qui le webhook Stripe partagé passe les
    // événements `identity.*`. La dépendance ne va que dans ce sens — le
    // contexte de conformité ignore l'existence de la trésorerie.
    KycModule,
    CloudStorageModule,
    NotificationsModule,
  ],
  controllers: [WalletController, PaymentController],
  providers: [
    { provide: PAYMENT_GATEWAY, useClass: StripePaymentAdapter },
    StripePaymentAdapter,
    StripeConnectAdapter,
    RequestRetraitUseCase,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: TreasuryErrorFilter },
  ],
  exports: [PAYMENT_GATEWAY, StripeConnectAdapter],
})
export class TreasuryModule {}
