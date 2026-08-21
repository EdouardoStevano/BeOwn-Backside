import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { InvestmentRepository } from '../../domain/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../../domain/repositories/investment.repository';
import type { ProjectRepository } from 'src/catalog/domain/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/catalog/domain/repositories/project.repository';
import type { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';
import { WALLET_REPOSITORY } from 'src/treasury/domain/repositories/wallet.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { USER_REPOSITORY } from 'src/iam/domain/repositories/user.repository';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import { CollecteCapacity } from 'src/subscription/domain/aggregates/collecte-capacity';
import { Investment } from 'src/subscription/domain/aggregates/investment';
import { EcheancierGenerator } from 'src/subscription/domain/domain-services/echeancier.domain-service';
import {
  InvestmentStatus,
  RemboursementMode,
} from 'src/subscription/domain/enums/investment-status.enum';
import { InvestissementSouscritDomainEvent } from 'src/subscription/domain/events/investissement-souscrit.domain-event';
import {
  ProjetIntrouvableError,
  SoldeInsuffisantError,
  WalletIntrouvableError,
} from 'src/subscription/domain/errors/subscription.errors';
import { InvestmentFactory } from 'src/subscription/domain/factories/investment.factory';
import type { ProjetSouscriptible } from 'src/subscription/domain/value-objects/projet-souscriptible';
import { CreateInvestmentDto } from 'src/subscription/presentation/http/dto/investment.dto';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/treasury/domain/enums/wallet.enum';
import { ContractGeneratorService } from '../services/contract-generator.service';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { Document } from 'src/documents/domains/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/subscription/infrastructure/persistence/entities/echeance.entity';
import { InvestmentOrmMapper } from 'src/subscription/infrastructure/persistence/mappers/investment.orm-mapper';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { WalletOrmMapper } from 'src/treasury/infrastructure/persistence/mappers/wallet.orm-mapper';
import { EligibilitePsfpTranslator } from '../acl/eligibilite-psfp.translator';
import { ProjetSouscriptibleTranslator } from '../acl/projet-souscriptible.translator';

/**
 * **Souscrire** — l'investisseur achète des fractions d'un projet en collecte,
 * ses fonds sont débités et son échéancier généré.
 *
 * Le use case orchestre, il ne décide pas (§14). Ce qui vivait ici et vit
 * désormais dans le domaine :
 *
 * - les portes de la souscription (projet ouvert, fractions disponibles,
 *   ticket plafond, plafond PSFP) → {@link InvestmentFactory.souscrire} ;
 * - l'invariant d'anti-survente et le constat que la collecte est complète →
 *   {@link CollecteCapacity} ;
 * - le calcul de l'échéancier, quarante lignes dupliquées avec le top-up →
 *   {@link EcheancierGenerator} ;
 * - la fenêtre de rétractation PSFP de 4 jours → la Factory, puis l'agrégat.
 *
 * **Les portes métier sont éprouvées une seule fois, sous le verrou.** La
 * version précédente les jouait deux fois — une passe optimiste hors
 * transaction, puis une passe verrouillée qui seule faisait foi — en
 * dupliquant chaque règle et chaque message. Seule la passe verrouillée dit le
 * vrai : c'est celle qui reste. Le coût est un verrou pris un peu plus tôt sur
 * la ligne projet ; le gain est qu'une règle ne peut plus diverger d'avec
 * elle-même.
 *
 * L'atomicité (anti-survente + débit garanti) est inchangée : la ligne projet
 * sérialise les insertions concurrentes, la ligne wallet garantit un solde relu
 * sous verrou avant débit, et le moindre `throw` annule l'ensemble
 * (investissement, débit, ledger, échéances, passage FINANCE).
 *
 * > Reste un écart assumé (§15) : la transaction manipule directement des
 * > entités ORM d'autres contextes (`WalletEntity`, `ProjectEntity`) via
 * > l'`EntityManager`, faute d'unité de travail partagée. C'est la dette que
 * > `SubscriptionModule` signale déjà ; la résorber demande un port de
 * > transaction, pas un remodelage du domaine.
 */
@Injectable()
export class CreateInvestmentUseCase {
  private readonly logger = new Logger(CreateInvestmentUseCase.name);

  constructor(
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly cloudStorage: CloudStorageService,
    private readonly notificationEvents: NotificationEventService,
    private readonly eventBus: EventBus,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(userId: number, dto: CreateInvestmentDto): Promise<Investment> {
    const dejaTraite = await this.rejouerSiDejaTraite(userId, dto);
    if (dejaTraite) return dejaTraite;

    const projetCatalogue = await this.projectRepository.findProjectById(
      dto.projetId,
    );
    if (!projetCatalogue) throw new ProjetIntrouvableError(dto.projetId);
    const projet = ProjetSouscriptibleTranslator.traduire(projetCatalogue);

    const eligibilite = EligibilitePsfpTranslator.traduire(
      await this.profilPPRepository.findByUserId(userId),
    );

    // Le wallet est relu sous verrou dans la transaction ; cette lecture ne
    // sert qu'à en connaître l'identité et la devise.
    const wallet = await this.walletRepository.findWalletByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) throw new WalletIntrouvableError();

    const souscrit = await this.dataSource.transaction(async (manager) => {
      // 1. Verrou sur la ligne projet — sérialise l'allocation de fractions.
      const projectRow = await manager.findOne(ProjectEntity, {
        where: { id: dto.projetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!projectRow) throw new ProjetIntrouvableError(dto.projetId);

      // 2. Recompte des fractions vendues SOUS VERROU. Les insertions
      //    concurrentes sur ce projet sont bloquées par le verrou ci-dessus,
      //    donc le total est exact.
      const capacite = CollecteCapacity.duProjet(
        projet,
        await this.recompterFractionsVendues(manager, dto.projetId),
      );

      // 3. Le domaine tranche, sur l'état verrouillé du projet.
      const naissant = InvestmentFactory.souscrire(
        {
          projet: auStatutVerrouille(projet, projectRow.statut),
          utilisateurId: userId,
          nbFractions: dto.nbFractions,
          eligibilite,
          consentementDepassementLimite: dto.consentementDepassementLimite,
          reservationId: dto.reservationId,
        },
        capacite,
      );

      // 4. Verrou sur la ligne wallet + solde relu SOUS VERROU avant débit.
      const walletRow = await manager.findOne(WalletEntity, {
        where: { id: wallet.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!walletRow) throw new WalletIntrouvableError();
      if (Number(walletRow.solde) < naissant.montant) {
        throw new SoldeInsuffisantError(
          Number(walletRow.solde),
          naissant.montant,
        );
      }

      // 5. Persistance de l'investissement.
      const savedEntity = await manager.save(
        InvestmentEntity,
        InvestmentOrmMapper.naissantToEntity(naissant),
      );
      const investment = InvestmentOrmMapper.toDomain(savedEntity);

      // 6. Débit du wallet SOUS VERROU (source de vérité du débit).
      walletRow.solde = Number(walletRow.solde) - investment.montant;
      await manager.save(WalletEntity, walletRow);

      // 7. Écriture de la transaction ledger (clé d'idempotence conservée).
      await manager.save(
        TransactionEntity,
        WalletOrmMapper.txToEntity(
          this.tracerSouscription(investment, wallet, userId, dto),
        ),
      );

      // 8. Génération + persistance de l'échéancier.
      const echeances = EcheancierGenerator.generer(
        investment,
        projet,
        dto.modeRemboursement ?? RemboursementMode.IN_FINE,
      );
      await manager.save(
        EcheanceEntity,
        echeances.map(InvestmentOrmMapper.echeanceNaissanteToEntity),
      );

      // 9. Collecte complète → FINANCE, sûr car on détient le verrou projet.
      //    Le constat appartient à la capacité ; le passage de statut est un
      //    fait de `catalog` que ce contexte se contente d'appliquer (§3.4).
      if (capacite.estIntegralementSouscrite) {
        projectRow.statut = ProjectStatus.FINANCE;
        await manager.save(ProjectEntity, projectRow);
      }

      return investment;
    });

    await this.publierEtNotifier(souscrit, projetCatalogue, userId);

    return souscrit;
  }

  // ── Orchestration annexe ──────────────────────────────────────────────────

  /**
   * Rejoue une souscription déjà traitée : deux requêtes portant la même clé
   * d'idempotence rendent le même investissement, sans second débit.
   */
  private async rejouerSiDejaTraite(
    userId: number,
    dto: CreateInvestmentDto,
  ): Promise<Investment | null> {
    if (!dto.idempotencyKey) return null;

    const precedente =
      await this.walletRepository.findTransactionByIdempotencyKey(
        cleDIdempotence(userId, dto.idempotencyKey),
      );
    if (!precedente?.investissementId) return null;

    return this.investmentRepository.findById(precedente.investissementId);
  }

  /** Le même filtre que `countFractionsVendues`, mais sous le verrou projet. */
  private async recompterFractionsVendues(
    manager: { createQueryBuilder: (...args: any[]) => any },
    projetId: string,
  ): Promise<number> {
    const raw = await manager
      .createQueryBuilder(InvestmentEntity, 'i')
      .select('COALESCE(SUM(i.nbTitres), 0)', 'total')
      .where('i.projetId = :projetId', { projetId })
      .andWhere('i.statut NOT IN (:...exclus)', {
        exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getRawOne();
    return Number(raw?.total ?? 0);
  }

  private tracerSouscription(
    investment: Investment,
    wallet: { id: string; devise: string },
    userId: number,
    dto: CreateInvestmentDto,
  ): Transaction {
    const tx = new Transaction();
    tx.walletSource = wallet.id;
    tx.walletDestination = null;
    tx.type = TransactionType.SOUSCRIPTION;
    tx.montant = investment.montant;
    tx.devise = wallet.devise;
    tx.statut = TransactionStatus.REUSSI;
    tx.fournisseur = TransactionFournisseur.INTERNE;
    tx.referenceExterne = null;
    tx.investissementId = investment.id;
    tx.echeanceId = null;
    tx.reservationId = null;
    tx.projetId = investment.projetId;
    tx.idempotencyKey = dto.idempotencyKey
      ? cleDIdempotence(userId, dto.idempotencyKey)
      : `invest:${userId}:${investment.id}`;
    tx.fraisPsp = 0;
    tx.fraisPlateforme = 0;
    tx.metadata = null;
    tx.motifEchec = null;
    return tx;
  }

  /**
   * Effets de bord APRÈS commit. Le bulletin part en tâche de fond : sa
   * génération est lente et son échec ne doit pas annuler une souscription
   * déjà réglée.
   */
  private async publierEtNotifier(
    investment: Investment,
    projetCatalogue: { titre: string; ville: string | null; pays: string },
    userId: number,
  ): Promise<void> {
    this.eventBus.publish(
      new InvestissementSouscritDomainEvent(
        investment.id,
        investment.projetId,
        investment.utilisateurId,
        investment.montant,
        investment.nbTitres ?? 0,
        investment.reservationId,
      ),
    );

    void this.genererEtArchiverLeBulletin(investment, userId).catch((err) =>
      this.logger.error(
        `Bulletin generation failed for investment ${investment.id}: ${err?.message}`,
      ),
    );

    const user = await this.userRepository.findById(userId);
    if (user) {
      this.notificationEvents.investmentCreated(
        investment,
        projetCatalogue,
        user,
      );
    }
  }

  private async genererEtArchiverLeBulletin(
    investment: Investment,
    userId: number,
  ): Promise<void> {
    const projet = investment.projet;
    const user = await this.userRepository.findById(userId);

    const pdfBuffer = await this.contractGenerator.generateBulletin({
      investment,
      projectTitle: projet?.titre ?? '',
      projectVille: projet?.ville ?? '',
      projectPays: projet?.pays ?? '',
      investorFirstname: user?.firstname ?? 'Investisseur',
      investorLastname: user?.lastname ?? '',
      investorEmail: user?.email ?? '',
      triCible: Number(projet?.triCible ?? 0),
      dureeMois: Number(projet?.dureeMois ?? 0),
    });

    const filename = `bulletin_${investment.id}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdfBuffer,
      filename,
      'application/pdf',
      'contrats',
    );

    const doc = new Document();
    doc.type = DocumentType.BULLETIN_SOUSCRIPTION;
    doc.relatedTo = DocumentRelatedTo.INVESTMENT;
    doc.userId = null;
    doc.projectId = investment.projetId;
    doc.investmentId = investment.id;
    doc.originalName = filename;
    doc.filename = objectName;
    doc.mimeType = 'application/pdf';
    doc.sizeBytes = pdfBuffer.length;
    doc.path = publicUrl;
    doc.isPublic = false;
    doc.uploadedBy = userId;
    doc.ordre = null;
    doc.estPrincipale = false;

    const savedDoc = await this.documentRepository.save(doc);

    investment.attacherBulletin(savedDoc.id);
    await this.investmentRepository.save(investment);

    this.logger.log(
      `Bulletin généré: investmentId=${investment.id} docId=${savedDoc.id} url=${publicUrl}`,
    );
  }
}

const cleDIdempotence = (userId: number, cle: string): string =>
  `invest-request:${userId}:${cle}`;

/**
 * La vue du projet, réalignée sur le statut relu sous verrou. Entre la lecture
 * initiale et la prise du verrou, la collecte a pu se clore : c'est cet état-là
 * que la Factory doit éprouver.
 */
const auStatutVerrouille = (
  projet: ProjetSouscriptible,
  statutVerrouille: ProjectStatus,
): ProjetSouscriptible => ({
  ...projet,
  enCollecte: statutVerrouille === ProjectStatus.EN_COLLECTE,
  dejaFinance: statutVerrouille === ProjectStatus.FINANCE,
});
