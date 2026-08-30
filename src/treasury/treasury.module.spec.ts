import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HandleIdentityWebhookUseCase } from 'src/compliance/application/usecases/kyc/handle-identity-webhook.usecase';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { TokenService } from 'src/iam/application/services/token/token.service';
import { INVESTOR_COMPLIANCE_PROFILE_REPOSITORY } from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { PaymentController } from './presentation/http/payment.controller';
import { WalletController } from './presentation/http/wallet.controller';
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
import { WALLET_REPOSITORY } from './domain/repositories/wallet.repository';
import { TRANSACTION_REPOSITORY } from './domain/repositories/transaction.repository';
import { StripePaymentAdapter } from './infrastructure/external-services/stripe-payment.adapter';
import { StripeConnectAdapter } from './infrastructure/external-services/stripe-connect.adapter';
import { NotificationTreasuryAdapter } from './infrastructure/external-services/notification-treasury.adapter';

/**
 * Le câblage du contexte tient-il debout ?
 *
 * Un `tsc` propre ne dit rien de la résolution des dépendances : un port
 * déclaré mais non fourni, ou un adaptateur dont un paramètre a disparu, ne se
 * voient qu'au démarrage. Ce refactoring a introduit trois ports et six use
 * cases là où le contrôleur se faisait injecter des repositories TypeORM — le
 * vérifier ici vaut mieux que de le découvrir en production.
 *
 * Le montage reprend **la liste de providers de `TreasuryModule`**, sans ses
 * imports : monter le module réel tirerait toute l'infrastructure d'IAM et de
 * la conformité, et ce test parlerait alors de leur câblage plutôt que du
 * nôtre. Les frontières du contexte — les deux repositories, la configuration,
 * les notifications, le webhook d'identité — sont fournies en doublure.
 */
describe('TreasuryModule — câblage', () => {
  const monter = () =>
    Test.createTestingModule({
      // Le bus réel : les use cases s'en font injecter un.
      imports: [CqrsModule],
      controllers: [PaymentController, WalletController],
      providers: [
        { provide: PAYMENT_GATEWAY, useClass: StripePaymentAdapter },
        { provide: CONNECT_GATEWAY, useClass: StripeConnectAdapter },
        { provide: TREASURY_NOTIFIER, useClass: NotificationTreasuryAdapter },
        StripePaymentAdapter,
        ConsulterUnPortefeuilleUseCase,
        ConsulterLePortefeuilleDunTitulaireUseCase,
        ListerLesMouvementsDunPortefeuilleUseCase,
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
        RetraitEventHandler,
        DepotEventHandler,
        DepotEventHandler,
        DemanderUnRetraitUseCase,
        RendreLeSoldeUseCase,
        ReglerUnRetraitUseCase,
        SynchroniserUnRetraitUseCase,
        TraiterUnEvenementStripeUseCase,
        // Les frontières, en doublure.
        { provide: WALLET_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_REPOSITORY, useValue: {} },
        { provide: getRepositoryToken(UserEntity), useValue: {} },
        { provide: NotificationService, useValue: {} },
        {
          provide: HandleIdentityWebhookUseCase,
          useValue: { handle: jest.fn() },
        },
        // Les gardes montées par les contrôleurs sont résolues à la compilation
        // du module : leurs dépendances viennent d'IAM et de la conformité.
        { provide: TokenService, useValue: {} },
        { provide: INVESTOR_COMPLIANCE_PROFILE_REPOSITORY, useValue: {} },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(), getOrThrow: jest.fn(() => 'sk_test_x') },
        },
      ],
    }).compile();

  it('résout les deux contrôleurs, les trois ports et les onze use cases', async () => {
    const module = await monter();

    expect(module.get(PaymentController)).toBeDefined();
    expect(module.get(WalletController)).toBeDefined();

    expect(module.get(PAYMENT_GATEWAY)).toBeInstanceOf(StripePaymentAdapter);
    expect(module.get(CONNECT_GATEWAY)).toBeInstanceOf(StripeConnectAdapter);
    expect(module.get(TREASURY_NOTIFIER)).toBeInstanceOf(
      NotificationTreasuryAdapter,
    );

    expect(module.get(OuvrirUnDepotUseCase)).toBeDefined();
    expect(module.get(ConfirmerUnDepotUseCase)).toBeDefined();
    expect(module.get(CrediterUnDepotUseCase)).toBeDefined();
    expect(module.get(DemanderUnRetraitUseCase)).toBeDefined();
    expect(module.get(RendreLeSoldeUseCase)).toBeDefined();
    expect(module.get(TraiterUnEvenementStripeUseCase)).toBeDefined();
    expect(module.get(ReglerUnRetraitUseCase)).toBeDefined();
    expect(module.get(SynchroniserUnRetraitUseCase)).toBeDefined();
    expect(module.get(ConsulterUnPortefeuilleUseCase)).toBeDefined();
    expect(
      module.get(ConsulterLePortefeuilleDunTitulaireUseCase),
    ).toBeDefined();
    expect(module.get(ListerLesMouvementsDunPortefeuilleUseCase)).toBeDefined();
    expect(module.get(OuvrirUnPortefeuilleDePlateformeUseCase)).toBeDefined();
    expect(module.get(ConsignerUnMouvementManuelUseCase)).toBeDefined();
    // L'abonné qui porte désormais le port de notification.
    expect(module.get(RetraitEventHandler)).toBeDefined();
    expect(module.get(DepotEventHandler)).toBeDefined();

    await module.close();
  });
});
