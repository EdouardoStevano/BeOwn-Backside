import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionInfrastructureModule } from 'src/subscription/infrastructure/subscription-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IfuGenerationService } from './application/services/ifu-generation.service';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistence/entities/document.entity';

/**
 * Bounded Context **Regulatory Reporting** (§3.2, M11 + §2.6/2.7) : ce que la
 * plateforme doit rendre à l'administration et à ses investisseurs — IFU,
 * reporting AMF, et à terme la gestion extinctive (run-off).
 *
 * **C'est un contexte volontairement « fin » (§3.3), et cela change tout.**
 * L'essentiel de M11 est un calcul *déjà fait ailleurs* : les intérêts et la
 * retenue à la source sont calculés par `servicing` (RG-ECH-04/05). Ce contexte
 * les met en forme et les agrège — ce sont des projections et des read models
 * (§11), pas des agrégats riches. §44 le dit sans ambiguïté : y appliquer la
 * rigueur de modélisation de `reservation` serait du temps d'ingénierie mal
 * investi. Le seul noyau de règles propres que §3.3 lui réserve est le run-off,
 * qui n'existe pas encore.
 *
 * **Il s'appelait `fiscalite`, et il ne couvrait que la moitié du sujet.** M11
 * n'est pas la fiscalité : c'est le reporting réglementaire, dont l'IFU n'est
 * qu'une pièce à côté du rapport AMF et de la gestion extinctive.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval, et jamais amont.** Il lit `servicing` (échéances réglées),
 *   `subscription` (investissements) et `iam` (identité du bénéficiaire), et
 *   n'est lu par personne. Si un contexte métier avait un jour besoin d'une
 *   donnée de reporting pour décider, ce serait le signal que la frontière a
 *   été mal tracée (§3.4).
 *
 * **Il n'y a plus qu'un IFU, et c'est le sujet de son dernier remaniement.**
 * Deux chaînes coexistaient pour le même investisseur et la même année, sur
 * deux assiettes différentes : l'une agrégeait les `Echeance` réglées (coupons
 * obligataires), l'autre les `DistributionPart` (revenus locatifs), chacune
 * avec son cron et son propre document. Un investisseur détenant les deux
 * recevait deux documents partiels, et aucun ne portait son revenu imposable
 * total. La seconde est partie avec la ligne de produit locative, que §1.4.3
 * place hors périmètre — BeOwn est exclusivement obligataire. Ce qui restait un
 * arbitrage fiscal insoluble tant que les deux produits coexistaient est
 * devenu sans objet.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - `AdminReportsController` (rapports AMF/AML/mensuel) reste dans `src/admin/`
 *   avec les autres écrans du back-office, ce que §3.3 admet : le back-office
 *   compose des Queries, il n'est pas un Bounded Context ;
 * - la **gestion extinctive** (§2.6), seul vrai cycle de vie que §3.3 attribue
 *   à ce contexte, n'est pas modélisée — `RunOffPlan` n'existe pas.
 */
@Module({
  imports: [
    SubscriptionInfrastructureModule,
    UsersInfrastructureModule,
    IamInfrastructureModule,
    CloudStorageModule,
    NotificationsModule,
    // La source que ce contexte agrège en lecture, et le document où il dépose
    // le PDF produit.
    TypeOrmModule.forFeature([EcheanceEntity, DocumentEntity]),
  ],
  providers: [IfuGenerationService],
  exports: [IfuGenerationService],
})
export class RegulatoryReportingModule {}
