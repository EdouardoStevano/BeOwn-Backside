import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegulatoryReportingInfrastructureModule } from './infrastructure/regulatory-reporting-infrastructure.module';
import { DistributionsInfrastructureModule } from 'src/distributions/infrastructure/distributions-infrastructure.module';
import { SubscriptionInfrastructureModule } from 'src/subscription/infrastructure/subscription-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { GenerateInvestisseurIfuUseCase } from './application/usecases/generate-investisseur-ifu.usecase';
import { IfuPdfService } from './application/services/ifu-pdf.service';
import { IfuCronService } from './application/services/ifu-cron.service';
import { IfuGenerationService } from './application/services/ifu-generation.service';
import { InvestisseurFiscaliteController } from './presentation/http/investisseur-fiscalite.controller';
import { AdminFiscaliteController } from './presentation/http/admin-fiscalite.controller';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistence/entities/document.entity';

/**
 * Bounded Context **Regulatory Reporting** (§3.2, M11 + §2.6/2.7) : ce que la
 * plateforme doit rendre à l'administration et à ses investisseurs — IFU,
 * reporting AMF, et à terme la gestion extinctive (run-off).
 *
 * **C'est un contexte volontairement « fin » (§3.3), et cela change tout.**
 * L'essentiel de M11 est un calcul *déjà fait ailleurs* : les intérêts et la
 * retenue à la source sont calculés par `servicing` (RG-ECH-04/05), les parts
 * de distribution par `distributions`. Ce contexte les met en forme et les
 * agrège — ce sont des projections et des read models (§11), pas des agrégats
 * riches. §44 le dit sans ambiguïté : y appliquer la rigueur de modélisation
 * de `reservation` serait du temps d'ingénierie mal investi. Le seul noyau de
 * règles propres que §3.3 lui réserve est le run-off, qui n'existe pas encore.
 *
 * **Il s'appelait `fiscalite`, et il ne couvrait que la moitié du sujet.** M11
 * n'est pas la fiscalité : c'est le reporting réglementaire, dont l'IFU n'est
 * qu'une pièce à côté du rapport AMF et de la gestion extinctive. Le nom
 * rétrécissait le contexte à ce qu'il contenait le jour de sa création.
 *
 * `IfuGenerationService` l'a rejoint depuis `subscription`, qui signalait
 * lui-même l'écart en tête de son module.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval, et jamais amont.** Il lit `servicing` (échéances réglées),
 *   `distributions` (parts versées), `subscription` (investissements) et `iam`
 *   (identité du bénéficiaire), et n'est lu par personne. Si un contexte métier
 *   avait un jour besoin d'une donnée de reporting pour décider, ce serait le
 *   signal que la frontière a été mal tracée (§3.4).
 *
 * > ⚠️ **Deux IFU coexistent pour le même investisseur et la même année, et
 * > ils ne totalisent pas la même chose.** `GenerateInvestisseurIfuUseCase`
 * > agrège les `DistributionPart` (revenus locatifs) et persiste une ligne
 * > `document_fiscal` sans PDF, sur un cron du 15 janvier ;
 * > `IfuGenerationService` agrège les `Echeance` réglées (coupons
 * > obligataires) et produit un PDF rangé en `DocumentType.IFU_ANNUEL`, sur un
 * > cron du 1er février. Un investisseur qui détient les deux reçoit donc deux
 * > documents partiels, et aucun ne porte son revenu imposable total. Les
 * > réunir est un arbitrage fiscal — quelle assiette, quel formulaire, quel
 * > millésime — qui se tranche avec le RCCI, pas un refactoring : les deux
 * > chaînes sont laissées telles quelles, réunies dans ce module pour que
 * > l'écart cesse d'être invisible.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `IfuCronService.run()` énumère les investisseurs par `findUnpaid()` et un
 *   `findByUserId(0).catch(() => [])` — ses propres commentaires parlent de
 *   « fallback brutal » et de « stratégie simple ». La liste qu'il en tire
 *   n'est pas celle des bénéficiaires de l'année ;
 * - `DocumentFiscal` est un sac de champs publics (§7) et le calcul annuel vit
 *   dans le use case ;
 * - `AdminReportsController` (rapports AMF/AML/mensuel) reste dans `src/admin/`
 *   avec les autres écrans du back-office, ce que §3.3 admet : le back-office
 *   compose des Queries, il n'est pas un Bounded Context ;
 * - la **gestion extinctive** (§2.6), seul vrai cycle de vie que §3.3 attribue
 *   à ce contexte, n'est pas modélisée — `RunOffPlan` n'existe pas.
 */
@Module({
  imports: [
    RegulatoryReportingInfrastructureModule,
    DistributionsInfrastructureModule,
    SubscriptionInfrastructureModule,
    UsersInfrastructureModule,
    IamInfrastructureModule,
    CloudStorageModule,
    NotificationsModule,
    // Les deux sources que ce contexte agrège en lecture, et le document où il
    // dépose le PDF produit.
    TypeOrmModule.forFeature([EcheanceEntity, DocumentEntity]),
  ],
  controllers: [InvestisseurFiscaliteController, AdminFiscaliteController],
  providers: [
    GenerateInvestisseurIfuUseCase,
    IfuPdfService,
    IfuCronService,
    IfuGenerationService,
  ],
  exports: [
    RegulatoryReportingInfrastructureModule,
    GenerateInvestisseurIfuUseCase,
    IfuPdfService,
    IfuCronService,
    IfuGenerationService,
  ],
})
export class RegulatoryReportingModule {}
