import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { DocumentsInfrastructureModule } from './infrastructure/documents-infrastructure.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { DocumentController } from './presentation/http/document.controller';
import { DocumentsErrorFilter } from './presentation/http/filters/documents-error.filter';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';

/**
 * Bounded Context **Documents** (§3.2, transversal M5/M6/M9/M11) : la
 * génération, le stockage et la **signature électronique** des pièces —
 * bulletin de souscription, contrat de rachat, KIIS, IFU, pièces KYC, photos
 * de projet.
 *
 * C'est un contexte que le cahier des charges ne nomme pas : il fait référence
 * trois fois à de la génération de documents et de la signature sans jamais la
 * regrouper, comme si c'était un détail d'implémentation de chaque module.
 * §3.3 tranche l'inverse — c'est une capacité récurrente avec ses propres
 * règles (qui signe quoi, avec quel OTP, avec quelle durée d'archivage légal),
 * qui mérite son modèle plutôt que d'être dupliquée trois fois.
 *
 * **La signature rejoint le document.** Elle vivait dans un `src/signatures/`
 * de premier niveau, avec ses propres couches et son module d'infrastructure —
 * que personne n'importait, chaque contexte consommateur déclarant
 * `SignatureEntity` dans son propre `forFeature`. Ce n'était pas un Bounded
 * Context : §3.2 n'en connaît pas, et une signature n'existe pas sans le
 * document qu'elle fait signer. Les séparer revenait à couper en deux le seul
 * concept du contexte — `SignableDocument` — et c'est bien ce qui est arrivé :
 * la règle « une signature ne passe de PENDING à SIGNED qu'une fois » est
 * aujourd'hui recopiée dans le webhook YouSign, dans l'annulation d'initiation
 * et dans le back-office.
 *
 * Position dans la Context Map (§3.4) :
 *
 * - **aval de tous les contextes qui produisent des pièces** : `subscription`
 *   (bulletin), `secondary-market` (contrat de rachat), `catalog` (KIIS,
 *   photos), `compliance` (pièces KYC) ;
 * - **Anti-Corruption Layer** vers YouSign (le Universign du cahier des
 *   charges) et vers le stockage objet, tous deux **Generic** (§3.1) — achetés,
 *   jamais reconstruits.
 *
 * Le contexte a son modèle : `SignableDocument` est l'agrégat racine (§6), et
 * `Signature` l'entité interne qui porte le cycle de vie d'une demande — son
 * invariant tient en une phrase, une signature ne quitte `PENDING` qu'une fois.
 * Il a ses erreurs (`DocumentsError`) et leur filtre, ses mappers, et un port
 * dont les écritures de colonnes ont disparu.
 *
 * Écarts temporaires, assumés et à résorber (§3.3) :
 *
 * - les demandes de signature se lisent et s'écrivent encore par
 *   `Repository<SignatureEntity>` depuis `subscription` et `secondary-market`,
 *   faute de port : ces contextes traduisent par `SignatureOrmMapper` et jouent
 *   la transition sur l'entité, mais tiennent la ligne eux-mêmes — le webhook
 *   la verrouille dans sa propre transaction, un port ne saurait pas le faire ;
 * - `YouSignService` vit dans `src/common/yousign/` : l'adaptateur du
 *   partenaire de signature est rangé hors du contexte qu'il sert (§20) ;
 * - `DocumentController` compose encore lui-même ses règles d'accès en lisant
 *   projet et investissement : c'est du RBAC, qui appartient bien à la
 *   présentation (§3.3), mais il le fait par les entités ORM d'autres contextes
 *   plutôt que par un port.
 */
@Module({
  imports: [
    DocumentsInfrastructureModule,
    IamInfrastructureModule,
    CloudStorageModule,
    // Entités d'autres contextes : les règles d'accès à un document dépendent
    // du projet ou de l'investissement auquel il est rattaché.
    TypeOrmModule.forFeature([ProjectEntity, InvestmentEntity]),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [DocumentController],
  providers: [
    // Traduit les erreurs métier du contexte en réponses HTTP : le domaine ne
    // connaît aucun statut (§21), la présentation s'en charge.
    { provide: APP_FILTER, useClass: DocumentsErrorFilter },
  ],
})
export class DocumentsModule {}
