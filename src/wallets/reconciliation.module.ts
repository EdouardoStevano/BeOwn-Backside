import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from './infrastructure/persistences/entities/transaction.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PlateformeBalanceReader } from './applications/ports/plateforme-balance.port';
import { StripePlateformeBalanceAdapter } from './infrastructure/stripe-plateforme-balance.adapter';
import { ReconciliationService } from './applications/reconciliation.service';
import { ReconciliationCronService } from './applications/reconciliation-cron.service';
import { AdminReconciliationController } from './presenters/http/admin-reconciliation.controller';

/**
 * Réconciliation financière quotidienne — module autonome.
 *
 * Séparé de `WalletsModule` à dessein : le portefeuille sert les parcours
 * utilisateur, la réconciliation sert le contrôle interne. Les deux n'ont ni
 * le même rythme de changement, ni les mêmes dépendances (celle-ci est la
 * seule à avoir besoin du PSP), ni les mêmes destinataires.
 *
 * Câblage DIP : le service applicatif dépend du PORT
 * `PlateformeBalanceReader` ; l'adaptateur Stripe n'est nommé QU'ICI. Changer
 * de prestataire ne touche que cette ligne et le fichier d'adaptateur.
 *
 * `MetricsPort` n'est pas importé : `MetricsModule` est `@Global()` (cf.
 * observability/metrics/metrics.module.ts) et fournit le port à tout le
 * processus.
 */
@Module({
  imports: [
    // WalletEntity/TransactionEntity : lecture du grand livre.
    // UserEntity : relecture du rôle en base par le contrôleur (défense en
    // profondeur). Aucune de ces entités n'est écrite par ce module.
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, UserEntity]),
    // `JwtAuthGuard` (posé par le contrôleur admin) résout `TokenService` dans
    // le contexte de CE module : sans cet import, l'application ne démarre pas
    // (UnknownDependenciesException au bootstrap — constaté, pas théorique).
    IamInfrastructureModule,
    // Exporte `StripePaymentService`, porteur de l'unique client Stripe du
    // processus — l'adaptateur le réutilise au lieu de relire les clés.
    PaymentsModule,
    // `NotificationService` : alerte aux équipes financier / super-admin.
    NotificationsModule,
  ],
  controllers: [AdminReconciliationController],
  providers: [
    { provide: PlateformeBalanceReader, useClass: StripePlateformeBalanceAdapter },
    ReconciliationService,
    ReconciliationCronService,
  ],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
