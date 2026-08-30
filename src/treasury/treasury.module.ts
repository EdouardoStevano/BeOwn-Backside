import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TreasuryInfrastructureModule } from './infrastructure/treasury-infrastructure.module';
import { WalletController } from './presentation/http/wallet.controller';
import { PaymentController } from './presentation/http/payment.controller';
import { OuvrirUnDepotUseCase } from './application/usecases/ouvrir-un-depot.usecase';
import { ConfirmerUnDepotUseCase } from './application/usecases/confirmer-un-depot.usecase';
import { CrediterUnDepotUseCase } from './application/usecases/crediter-un-depot.usecase';
import { DemanderUnRetraitUseCase } from './application/usecases/demander-un-retrait.usecase';
import { SortieDeFondsService } from './application/services/sortie-de-fonds.service';
import { AcheminementDuRetraitService } from './application/services/acheminement-du-retrait.service';
import { RetraitEventHandler } from './application/handlers/retrait.event-handler';
import { DepotEventHandler } from './application/handlers/depot.event-handler';
import { RendreLeSoldeUseCase } from './application/usecases/rendre-le-solde.usecase';
import { TraiterUnEvenementStripeUseCase } from './application/usecases/traiter-un-evenement-stripe.usecase';
import { ReglerUnRetraitUseCase } from './application/usecases/regler-un-retrait.usecase';
import { SynchroniserUnRetraitUseCase } from './application/usecases/synchroniser-un-retrait.usecase';
import { ConsulterUnPortefeuilleUseCase } from './application/usecases/consulter-un-portefeuille.usecase';
import { ConsulterLePortefeuilleDunTitulaireUseCase } from './application/usecases/consulter-le-portefeuille-dun-titulaire.usecase';
import { ListerLesMouvementsDunPortefeuilleUseCase } from './application/usecases/lister-les-mouvements-dun-portefeuille.usecase';
import { OuvrirUnPortefeuilleDePlateformeUseCase } from './application/usecases/ouvrir-un-portefeuille-de-plateforme.usecase';
import { ConsignerUnMouvementManuelUseCase } from './application/usecases/consigner-un-mouvement-manuel.usecase';
import { PAYMENT_GATEWAY } from './application/ports/payment.gateway';
import { CONNECT_GATEWAY } from './application/ports/connect.gateway';
import { TREASURY_NOTIFIER } from './application/ports/treasury-notifier.port';
import { StripePaymentAdapter } from './infrastructure/external-services/stripe-payment.adapter';
import { StripeConnectAdapter } from './infrastructure/external-services/stripe-connect.adapter';
import { NotificationTreasuryAdapter } from './infrastructure/external-services/notification-treasury.adapter';
import { TreasuryErrorFilter } from './presentation/http/filters/treasury-error.filter';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { KycModule } from 'src/onboarding/application/kyc.module';
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
 * concurrent, mais l'adaptateur de sortie de celui-ci.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `reservation` (HOLD des fonds), de `subscription` (débit à la
 *   souscription, recrédit à la rétractation) et de `servicing` (MassPay des
 *   coupons) — ces contextes déclenchent les mouvements, ce contexte les tient ;
 * - **Conformist** vis-à-vis de Stripe, dont BeOwn adopte le modèle de wallets
 *   et de webhooks, mais protégé par une **Anti-Corruption Layer** (§20) : les
 *   ports `PaymentGateway` et `ConnectGateway` sont désormais la seule
 *   frontière par laquelle Stripe entre.
 *
 * **Les écarts que ce module signalait sont résorbés.** `PaymentController` ne
 * connaît plus ni `Repository<…Entity>` ni `DataSource` : les dépôts, les
 * retraits et les quatre branches de webhook sont des use cases, l'argent ne
 * bouge que par le registre, et les agrégats `Wallet` et `Transaction` — qui
 * existaient sans jamais être appelés — portent enfin leurs invariants. Une
 * conséquence directe : un **portefeuille gelé ne peut plus être crédité ni
 * débité**, ce que le décrément conditionnel SQL, seul garde-fou jusqu'ici, ne
 * regardait pas.
 *
 * Écarts restants, assumés et à résorber (§3.3) :
 *
 * - le module enregistre `UserEntity`, entité d'un autre contexte, parce que le
 *   compte Stripe Connect d'un investisseur est rangé sur sa ligne de compte
 *   IAM. Le résorber demande une table propre à la trésorerie et une migration
 *   de données ;
 * - `transaction_paiement` porte **deux colonnes** pour le même rattachement,
 *   `"walletSource"` et `"wallet_source"` (voir `TransactionSnapshot`). La
 *   consolidation déplace des écritures comptables et mérite son propre
 *   passage ;
 * - les refus de retrait sortent en `202 { success: false }` plutôt qu'en
 *   `4xx`. Les erreurs de domaine correspondantes existent ; c'est le contrat
 *   d'API qui n'a pas encore été mis à jour, et ce n'est pas au refactoring de
 *   le décider.
 */
@Module({
  imports: [
    ConfigModule,
    // Bus d'événements du contexte : le retrait annonce des faits, sans
    // savoir qui y réagit (§38.3).
    CqrsModule,
    // `UserEntity` seule : les entités de la trésorerie sont montées par son
    // module d'infrastructure, qui est le seul à les toucher.
    TypeOrmModule.forFeature([UserEntity]),
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
    // Les trois ports du contexte et leurs adaptateurs. Aucun use case ne
    // dépend d'une classe concrète (§33) : c'est ce qui rend les parcours
    // financiers éprouvables sans Stripe ni base de données.
    { provide: PAYMENT_GATEWAY, useClass: StripePaymentAdapter },
    { provide: CONNECT_GATEWAY, useClass: StripeConnectAdapter },
    { provide: TREASURY_NOTIFIER, useClass: NotificationTreasuryAdapter },
    // `StripePaymentAdapter` est aussi fourni sous son nom de classe :
    // `StripeConnectAdapter` lui emprunte son client Stripe, pour que les clés
    // ne soient lues qu'à un seul endroit.
    StripePaymentAdapter,
    // Le portefeuille : ses trois lectures, son ouverture pour la structure,
    // et l'écriture manuelle au registre du back-office.
    ConsulterUnPortefeuilleUseCase,
    ConsulterLePortefeuilleDunTitulaireUseCase,
    ListerLesMouvementsDunPortefeuilleUseCase,
    OuvrirUnPortefeuilleDePlateformeUseCase,
    ConsignerUnMouvementManuelUseCase,
    OuvrirUnDepotUseCase,
    ConfirmerUnDepotUseCase,
    CrediterUnDepotUseCase,
    // Les deux services que la façade du retrait orchestre : l'un tient le
    // solde et le registre, l'autre parle au fournisseur (§14).
    SortieDeFondsService,
    AcheminementDuRetraitService,
    // Le seul endroit du parcours de retrait qui sache qu'on notifie.
    RetraitEventHandler,
    DepotEventHandler,
    DemanderUnRetraitUseCase,
    RendreLeSoldeUseCase,
    // Le sort d'un versement, et les deux chemins par lesquels on l'apprend :
    // le webhook l'annonce, la réconciliation va le chercher. Un seul jeu de
    // transitions pour les deux (§14).
    ReglerUnRetraitUseCase,
    SynchroniserUnRetraitUseCase,
    TraiterUnEvenementStripeUseCase,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: TreasuryErrorFilter },
  ],
  exports: [PAYMENT_GATEWAY, CONNECT_GATEWAY],
})
export class TreasuryModule {}
