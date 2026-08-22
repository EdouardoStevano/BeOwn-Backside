import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicingInfrastructureModule } from './infrastructure/servicing-infrastructure.module';
import { EcheanceEntity } from './infrastructure/persistence/entities/echeance.entity';
import { PayEcheanceUseCase } from './application/usecases/pay-echeance.usecase';
import { EcheancesCronService } from './application/services/echeances-cron.service';
import { ProjectScheduleGeneratorService } from './application/services/project-schedule-generator.service';
import { ServicingErrorFilter } from './presentation/http/filters/servicing-error.filter';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';

/**
 * Bounded Context **Servicing** (§3.2, M8) : la vie de l'obligation après la
 * signature — l'échéancier de remboursement, le calcul et le versement des
 * coupons, la retenue à la source, et la qualification des retards jusqu'au
 * défaut.
 *
 * **Il vivait dans `subscription`.** L'échéance, ses stratégies de calcul, le
 * PFU, le règlement du coupon et les crons de rappel étaient rangés dans le
 * contexte de la souscription, qui signalait lui-même l'écart en tête de son
 * module. Ce sont pourtant deux métiers qui ne changent pas pour les mêmes
 * raisons : souscrire est un acte instantané et réglementé (fenêtre de
 * rétractation, plafond PSFP, bulletin signé) ; servir une obligation est un
 * calendrier qui court sur des années, avec sa fiscalité et ses impayés. Le
 * cahier des charges les sépare (M6 / M8), et §3.2 les tient pour deux
 * contextes.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval** de `subscription` : la signature déclenche l'échéancier. Le fait
 *   `InvestmentSigned` est le contrat prévu ; aujourd'hui la souscription
 *   appelle encore `EcheancierGenerator` dans sa propre transaction, en lui
 *   passant une *demande* (capital, TRI, durée) et non son agrégat — le
 *   couplage passe par une donnée, plus par un modèle ;
 * - **amont** de `treasury` : le règlement d'un coupon crédite le wallet de
 *   l'investisseur du net et les wallets séquestres IR et CSG ;
 * - **amont** de `regulatory-reporting` : `EcheancePayeeDomainEvent` porte les
 *   montants fiscaux, calculés ici une seule fois (§3.3 — l'IFU ne les
 *   recalcule pas).
 *
 * Ce module donne au contexte son nom et sa forme (§5) : ses erreurs propres
 * (`ServicingError`), son filtre, son vocabulaire (`EcheanceStatus`,
 * `RemboursementMode`) et son mapper. Le modèle riche — `RepaymentSchedule` en
 * agrégat racine, propriétaire de la numérotation et de la qualification des
 * retards (RG-ECH-11) — est l'étape suivante, comme pour `catalog`,
 * `subscription` et `treasury`.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `PayEcheanceUseCase` et `ProjectScheduleGeneratorService` manipulent
 *   directement les entités ORM et l'`EntityManager`, y compris celles de
 *   `treasury` (wallets, ledger) : le règlement d'un coupon est une
 *   transaction unique faute d'unité de travail partagée entre contextes —
 *   la résorber demande un port de transaction, pas un remodelage du domaine ;
 * - l'échéancier reste lisible par `GET /investments/:id/schedule`, servi par
 *   le contrôleur de `subscription` via `InvestmentRepository` ;
 * - `EcheanceEntity` porte encore une relation ORM vers `InvestmentEntity` :
 *   couplage d'infrastructure, pas de domaine — le domaine, lui, ne connaît de
 *   l'investissement que son identifiant (§6.2).
 */
@Module({
  imports: [
    // Bus d'événements du contexte : `EcheancePayeeDomainEvent` y est publié
    // après commit du règlement (§12).
    CqrsModule,
    TypeOrmModule.forFeature([
      EcheanceEntity,
      // Entités d'autres contextes : le règlement d'un coupon lit
      // l'investissement et son projet, et crédite les wallets dans la même
      // transaction — écart d'infrastructure documenté ci-dessus.
      InvestmentEntity,
      ProjectEntity,
      WalletEntity,
      TransactionEntity,
    ]),
    ServicingInfrastructureModule,
    NotificationsModule,
  ],
  providers: [
    PayEcheanceUseCase,
    EcheancesCronService,
    ProjectScheduleGeneratorService,
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ServicingErrorFilter },
  ],
  exports: [PayEcheanceUseCase, ProjectScheduleGeneratorService],
})
export class ServicingModule {}
