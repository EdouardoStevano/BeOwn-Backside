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
import { RepaymentScheduleController } from './presentation/http/repayment-schedule.controller';
import {
  AdminEcheancesController,
  AdminEcheancesItemController,
} from './presentation/http/admin-echeances.controller';
import { TriggerEcheancePaymentUseCase } from './application/usecases/trigger-echeance-payment.usecase';
import { GetAggregatedScheduleUseCase } from './application/usecases/get-aggregated-schedule.usecase';
import { PatchAggregatedEcheanceUseCase } from './application/usecases/patch-aggregated-echeance.usecase';
import { VerifierEcheanceProjetUseCase } from './application/usecases/verifier-echeance-projet.usecase';
import { SupprimerNumeroEcheanceUseCase } from './application/usecases/supprimer-numero-echeance.usecase';
import { CorrigerEcheanceUseCase } from './application/usecases/corriger-echeance.usecase';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { REPAYMENT_SCHEDULE_REPOSITORY } from './domain/repositories/repayment-schedule.repository';
import { TypeOrmRepaymentScheduleRepository } from './infrastructure/repositories/typeorm-repayment-schedule.repository';
import { TITULAIRE_INVESTISSEMENT_PORT } from './application/ports/titulaire-investissement.port';
import { TypeOrmTitulaireInvestissementAdapter } from './infrastructure/repositories/typeorm-titulaire-investissement.adapter';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
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
 * Le contexte a son modèle : `RepaymentSchedule` est l'agrégat racine (§6) —
 * la série ordonnée des coupons d'un investissement, par laquelle on
 * l'interroge (capital restant dû, intérêts perçus, prochaine échéance) et on
 * la règle. Il a son port (`RepaymentScheduleRepository`), ses erreurs
 * (`ServicingError`) et leur filtre, son vocabulaire (`EcheanceStatus`,
 * `RemboursementMode`), son mapper, et une Anti-Corruption Layer vers
 * `subscription` qui ne demande qu'une chose : à qui appartient
 * l'investissement (§20).
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `PayEcheanceUseCase` et `ProjectScheduleGeneratorService` manipulent
 *   directement les entités ORM et l'`EntityManager`, y compris celles de
 *   `treasury` (wallets, ledger) : le règlement d'un coupon est une
 *   transaction unique faute d'unité de travail partagée entre contextes —
 *   la résorber demande un port de transaction, pas un remodelage du domaine ;
 * - **RG-ECH-11 n'est pas appliquée.** `EcheanceStatus` distingue
 *   `RETARD_LEGER` (J+1→J+30), `RETARD_SIGNIFICATIF` (J+31→J+90) et `DEFAUT`
 *   (au-delà), mais aucun code ne les calcule : le CRON pose le statut hérité
 *   `RETARD` et l'échéance y reste. La qualifier changerait la payabilité
 *   d'échéances en cours (`DEFAUT` n'est pas payable) — c'est un arbitrage
 *   métier, pas un refactoring, et il se décide avec le RCCI ;
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
      // Les écrans d'administration relisent le rôle de l'appelant.
      UserEntity,
    ]),
    ServicingInfrastructureModule,
    // `TokenService` pour le JwtAuthGuard monté par le contrôleur.
    IamInfrastructureModule,
    UsersInfrastructureModule,
    NotificationsModule,
  ],
  controllers: [
    RepaymentScheduleController,
    AdminEcheancesController,
    AdminEcheancesItemController,
  ],
  providers: [
    PayEcheanceUseCase,
    EcheancesCronService,
    ProjectScheduleGeneratorService,
    TriggerEcheancePaymentUseCase,
    GetAggregatedScheduleUseCase,
    PatchAggregatedEcheanceUseCase,
    VerifierEcheanceProjetUseCase,
    SupprimerNumeroEcheanceUseCase,
    CorrigerEcheanceUseCase,
    {
      provide: REPAYMENT_SCHEDULE_REPOSITORY,
      useClass: TypeOrmRepaymentScheduleRepository,
    },
    // Anti-Corruption Layer vers `subscription` : le titulaire, et rien d'autre.
    {
      provide: TITULAIRE_INVESTISSEMENT_PORT,
      useClass: TypeOrmTitulaireInvestissementAdapter,
    },
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: ServicingErrorFilter },
  ],
  exports: [
    PayEcheanceUseCase,
    ProjectScheduleGeneratorService,
    REPAYMENT_SCHEDULE_REPOSITORY,
  ],
})
export class ServicingModule {}
