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
import type { DocumentRepository } from 'src/documents/domain/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/domain/repositories/document.repository';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { USER_REPOSITORY } from 'src/iam/domain/repositories/user.repository';
import { CollecteCapacity } from 'src/subscription/domain/aggregates/collecte-capacity';
import { Investment } from 'src/subscription/domain/aggregates/investment';
import { EcheancierGenerator } from 'src/servicing/domain/domain-services/echeancier.domain-service';
import { EcheanceOrmMapper } from 'src/servicing/infrastructure/persistence/mappers/echeance.orm-mapper';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { RemboursementMode } from 'src/servicing/domain/enums/echeance.enum';
import { InvestissementCompleteDomainEvent } from 'src/subscription/domain/events/investissement-complete.domain-event';
import {
  InvestissementIntrouvableError,
  ProjetIntrouvableError,
  SoldeInsuffisantError,
  WalletIntrouvableError,
} from 'src/subscription/domain/errors/subscription.errors';
import { Transaction } from 'src/treasury/domain/aggregates/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { ContractGeneratorService } from '../services/contract-generator.service';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { Document } from 'src/documents/domain/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domain/enums/document-type.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { InvestmentOrmMapper } from 'src/subscription/infrastructure/persistence/mappers/investment.orm-mapper';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { WalletOrmMapper } from 'src/treasury/infrastructure/persistence/mappers/wallet.orm-mapper';
import { ProjetSouscriptibleTranslator } from '../acl/projet-souscriptible.translator';

/**
 * **Compléter une souscription** — l'investisseur ajoute des fractions à un
 * investissement déjà confirmé, son wallet est débité du complément et son
 * échéancier régénéré sur le nouveau capital.
 *
 * Le use case orchestre, il ne décide pas (§14) : qui peut compléter quoi, et
 * depuis quel état, appartient à {@link Investment.completer} — titularité,
 * statut `CONFIRME`, fractions encore actives, quantité entière positive.
 * Ces quatre `if` vivaient ici, en clair. L'anti-survente appartient à
 * {@link CollecteCapacity}, et le calcul de l'échéancier — recopié à
 * l'identique depuis `CreateInvestmentUseCase` — à
 * {@link EcheancierGenerator}.
 *
 * Comme pour la souscription, les portes sont éprouvées **une seule fois, sous
 * le verrou** : la double passe optimiste/verrouillée dupliquait chaque règle
 * pour un verdict que seule la seconde rendait.
 *
 * L'atomicité est inchangée : verrou sur la ligne projet (sérialise le
 * recompte des fractions face aux souscriptions et top-ups concurrents), puis
 * sur la ligne wallet (solde relu sous verrou avant débit) ; mise à jour,
 * débit, ledger et régénération de l'échéancier vivent dans UNE transaction.
 */
@Injectable()
export class TopUpInvestmentUseCase {
  private readonly logger = new Logger(TopUpInvestmentUseCase.name);

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
    private readonly contractGenerator: ContractGeneratorService,
    private readonly cloudStorage: CloudStorageService,
    private readonly notificationEvents: NotificationEventService,
    private readonly eventBus: EventBus,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    investmentId: string,
    userId: number,
    nbFractions: number,
  ): Promise<Investment> {
    const investment = await this.investmentRepository.findById(investmentId);
    if (!investment) throw new InvestissementIntrouvableError(investmentId);

    const projetCatalogue = await this.projectRepository.findProjectById(
      investment.projetId,
    );
    if (!projetCatalogue) {
      throw new ProjetIntrouvableError(investment.projetId);
    }
    const projet = ProjetSouscriptibleTranslator.traduire(projetCatalogue);

    const wallet = await this.walletRepository.findByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) throw new WalletIntrouvableError();

    const montantDelta = await this.dataSource.transaction(async (manager) => {
      // 1. Verrou sur la ligne projet.
      const projectRow = await manager.findOne(ProjectEntity, {
        where: { id: investment.projetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!projectRow) throw new ProjetIntrouvableError(investment.projetId);

      // 2. Recompte des fractions vendues SOUS VERROU, puis allocation : c'est
      //    la capacité qui refuse une survente (§6).
      const capacite = CollecteCapacity.duProjet(
        projet,
        await this.recompterFractionsVendues(manager, investment.projetId),
      );
      capacite.allouer(nbFractions);

      // 3. Le domaine tranche : titularité, statut, fractions actives.
      const delta = investment.completer(
        userId,
        nbFractions,
        projet.prixFraction,
      );

      // 4. Verrou sur la ligne wallet + solde relu SOUS VERROU avant débit.
      const walletRow = await manager.findOne(WalletEntity, {
        where: { id: wallet.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!walletRow) throw new WalletIntrouvableError();
      if (Number(walletRow.solde) < delta) {
        throw new SoldeInsuffisantError(Number(walletRow.solde), delta);
      }

      // 5. Mise à jour de l'investissement (les deux champs que le complément
      //    déplace ; l'agrégat les porte déjà à leur nouvelle valeur).
      await manager.update(InvestmentEntity, investmentId, {
        nbTitres: investment.nbTitres,
        montant: investment.montant,
      });

      // 6. Débit du wallet SOUS VERROU.
      walletRow.solde = Number(walletRow.solde) - delta;
      await manager.save(WalletEntity, walletRow);

      // 7. Écriture de la transaction ledger.
      await manager.save(
        TransactionEntity,
        WalletOrmMapper.txToEntity(
          this.tracerComplement(investment, wallet, userId, delta),
        ),
      );

      // 8. Régénération de l'échéancier sur le nouveau capital.
      await manager.delete(EcheanceEntity, { investissementId: investmentId });
      const echeances = EcheancierGenerator.genererPour(
        {
          investissementId: investment.id,
          montant: investment.montant,
          triAnnuel: projet.triCible,
          dureeMois: projet.dureeMois,
          origine: new Date(),
        },
        RemboursementMode.IN_FINE,
      );
      await manager.save(
        EcheanceEntity,
        echeances.map(EcheanceOrmMapper.naissanteToEntity),
      );

      return delta;
    });

    this.eventBus.publish(
      new InvestissementCompleteDomainEvent(
        investment.id,
        investment.projetId,
        investment.utilisateurId,
        nbFractions,
        montantDelta,
        investment.montant,
      ),
    );

    void this.regenererLeBulletin(investment, userId).catch((err) =>
      this.logger.error(
        `Top-up bulletin regen failed for ${investmentId}: ${err?.message}`,
      ),
    );

    const user = await this.userRepository.findById(userId);
    if (user) {
      this.notificationEvents.fractionsToppedUp(
        investment,
        projetCatalogue,
        user,
        nbFractions,
        montantDelta,
      );
    }

    return investment;
  }

  // ── Orchestration annexe ──────────────────────────────────────────────────

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

  private tracerComplement(
    investment: Investment,
    wallet: { id: string; devise: string },
    userId: number,
    montantDelta: number,
  ): Transaction {
    const tx = new Transaction();
    tx.walletSource = wallet.id;
    tx.walletDestination = null;
    tx.type = TransactionType.SOUSCRIPTION;
    tx.montant = montantDelta;
    tx.devise = wallet.devise;
    tx.statut = TransactionStatus.REUSSI;
    tx.fournisseur = TransactionFournisseur.INTERNE;
    tx.referenceExterne = null;
    tx.investissementId = investment.id;
    tx.echeanceId = null;
    tx.reservationId = null;
    tx.projetId = investment.projetId;
    tx.idempotencyKey = `topup:${userId}:${investment.id}:${Date.now()}`;
    tx.fraisPsp = 0;
    tx.fraisPlateforme = 0;
    tx.metadata = null;
    tx.motifEchec = null;
    return tx;
  }

  /**
   * Le bulletin reflète le capital souscrit : il est régénéré après commit, et
   * le précédent est supprimé — un seul bulletin courant par investissement.
   */
  private async regenererLeBulletin(
    investment: Investment,
    userId: number,
  ): Promise<void> {
    const bulletinPrecedent = investment.bulletinDocId;
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

    const filename = `bulletin_${investment.id}_${Date.now()}.pdf`;
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
      `Top-up bulletin regenerated: investmentId=${investment.id} docId=${savedDoc.id}`,
    );

    if (bulletinPrecedent && bulletinPrecedent !== savedDoc.id) {
      await this.supprimerLeBulletinPrecedent(bulletinPrecedent);
    }
  }

  private async supprimerLeBulletinPrecedent(docId: string): Promise<void> {
    try {
      const ancien = await this.documentRepository.findById(docId);
      if (!ancien) return;
      await this.cloudStorage.delete(ancien.filename).catch(() => {});
      await this.documentRepository.delete(docId);
      this.logger.log(`Previous bulletin deleted: docId=${docId}`);
    } catch (err: any) {
      this.logger.warn(
        `Failed to delete previous bulletin ${docId}: ${err?.message ?? err}`,
      );
    }
  }
}
