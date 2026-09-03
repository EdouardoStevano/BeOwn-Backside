import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { InvestmentRepository } from '../ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../ports/repositories/investment.repository';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { UserRepository } from 'src/iam/domains/ports/user.repository';
import { USER_REPOSITORY } from 'src/iam/domains/ports/user.repository';
import { Echeance } from 'src/investments/domains/echeance';
import {
  EcheanceStatus,
  InvestmentStatus,
  RemboursementMode,
} from 'src/investments/domains/enums/investment-status.enum';
import { Transaction } from 'src/wallets/domains/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { ContractGeneratorService } from './contract-generator.service';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { formatEur } from 'src/shared/money/format-eur';
import { Document } from 'src/documents/domains/document';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';
import { Investment } from 'src/investments/domains/investment';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { InvestmentMapper } from 'src/investments/infrastructure/persistences/mappers/investment.mapper';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletMapper } from 'src/wallets/infrastructure/persistences/mappers/wallet.mapper';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';

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
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
  ) {}

  /** Clé d'idempotence d'un top-up, liée à l'appelant et à l'investissement. */
  static cleIdempotence(
    userId: number,
    investmentId: string,
    clientKey: string,
  ): string {
    return `topup:${userId}:${investmentId}:${clientKey}`;
  }

  async execute(
    investmentId: string,
    userId: number,
    nbFractions: number,
    idempotencyKey?: string,
  ): Promise<Investment> {
    // Même garde que `CreateInvestmentUseCase` : la clé fournie par le client
    // est retrouvée sur l'écriture du grand livre. Un retry (double-clic,
    // réseau) rend l'investissement DÉJÀ complété, sans second débit.
    if (idempotencyKey) {
      const previous = await this.walletRepository.findTransactionByIdempotencyKey(
        TopUpInvestmentUseCase.cleIdempotence(userId, investmentId, idempotencyKey),
      );
      if (previous) {
        const existing = await this.investmentRepository.findInvestmentById(investmentId);
        if (existing) return existing;
      }
    }

    const investment = await this.investmentRepository.findInvestmentById(investmentId);
    if (!investment) throw new NotFoundException('Investissement introuvable');
    if (investment.utilisateurId !== userId) throw new ForbiddenException('Accès refusé');
    if (investment.statut !== InvestmentStatus.CONFIRME) {
      throw new BadRequestException('Seuls les investissements confirmés peuvent être complétés');
    }
    if (!investment.nbTitres || investment.nbTitres <= 0) {
      throw new BadRequestException('Cet investissement ne possède plus de fractions actives');
    }

    const project = await this.projectRepository.findProjectById(investment.projetId);
    if (!project) throw new NotFoundException('Projet introuvable');

    const prixFraction = Number(investment.valeurTitre ?? project.prixFraction ?? project.ticketMinimum ?? 0);
    const nbFractionsTotal = project.nbFractions ?? Math.floor(Number(project.capitalCible) / prixFraction);
    const fractionsVendues = await this.investmentRepository.countFractionsVendues(investment.projetId);
    const disponibles = nbFractionsTotal - fractionsVendues;
    if (disponibles <= 0) {
      throw new BadRequestException('Il ne reste plus de fractions disponibles sur ce projet.');
    }
    if (nbFractions > disponibles) {
      throw new BadRequestException(
        `Seulement ${disponibles} fraction(s) disponible(s) sur ce projet`,
      );
    }
    const montantDelta = nbFractions * prixFraction;

    // ── Wallet check & deduction ──────────────────────────────────────────────
    const wallet = await this.walletRepository.findWalletByUser(userId, WalletType.INVESTISSEUR);
    if (!wallet) {
      throw new BadRequestException(
        "Wallet introuvable. Veuillez alimenter votre compte avant d'investir.",
      );
    }
    if (Number(wallet.solde) < montantDelta) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${formatEur(Number(wallet.solde))} — Requis : ${formatEur(montantDelta)}`,
      );
    }

    const newNbTitres = (investment.nbTitres ?? 0) + nbFractions;
    const newMontant = Number(investment.montant) + montantDelta;

    // ── Section critique atomique (anti-survente + débit garanti) ─────────────
    // Verrou sur la ligne projet (sérialise le recompte des fractions face aux
    // souscriptions/top-ups concurrents) puis sur la ligne wallet (solde relu
    // sous verrou avant débit). Mise à jour de l'investissement, débit, ledger
    // et régénération de l'échéancier vivent dans UNE transaction : tout throw
    // annule l'ensemble.
    let updated: Investment;
    try {
      updated = await this.executerTopUp(
        investment,
        investmentId,
        userId,
        nbFractions,
        montantDelta,
        newNbTitres,
        newMontant,
        nbFractionsTotal,
        wallet,
        project,
        idempotencyKey,
      );
    } catch (err: any) {
      // COURSE sur la même clé d'idempotence : deux retries simultanés passent
      // tous deux le pré-check, la contrainte d'unicité en base tranche — le
      // perdant est intégralement annulé (débit compris) avec sa transaction.
      // On lui rend l'investissement complété par le gagnant, pas une 500.
      const estDoublon =
        err?.code === '23505' || err?.driverError?.code === '23505';
      if (estDoublon && idempotencyKey) {
        const existing = await this.investmentRepository.findInvestmentById(investmentId);
        if (existing) return existing;
      }
      throw err;
    }

    // Async bulletin regeneration (non-blocking)
    this.regenerateBulletin(updated, project, userId).catch((err) =>
      this.logger.error(`Top-up bulletin regen failed for ${investmentId}: ${err?.message}`),
    );

    // Notify via facade (handles both user + admin)
    const user = await this.userRepository.findById(userId);
    if (user) {
      this.notificationEvents.fractionsToppedUp(updated, project, user, nbFractions, montantDelta);
    }

    return updated;
  }

  /** Section critique du top-up : tout ou rien, sous les verrous décrits ci-dessus. */
  private async executerTopUp(
    investment: Investment,
    investmentId: string,
    userId: number,
    nbFractions: number,
    montantDelta: number,
    newNbTitres: number,
    newMontant: number,
    nbFractionsTotal: number,
    wallet: { id: string; devise: string },
    project: any,
    idempotencyKey?: string,
  ): Promise<Investment> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Verrou sur la ligne projet.
      const projectRow = await manager.findOne(ProjectEntity, {
        where: { id: investment.projetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!projectRow) throw new NotFoundException('Projet introuvable');

      // 2. Recompte des fractions vendues SOUS VERROU (même filtre que
      //    countFractionsVendues : SUM(nbTitres) hors RETRACTE/ANNULE).
      const raw = await manager
        .createQueryBuilder(InvestmentEntity, 'i')
        .select('COALESCE(SUM(i.nbTitres), 0)', 'total')
        .where('i.projetId = :projetId', { projetId: investment.projetId })
        .andWhere('i.statut NOT IN (:...exclus)', {
          exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
        })
        .getRawOne<{ total: string }>();
      const fractionsVenduesLocked = Number(raw?.total ?? 0);
      const disponiblesLocked = nbFractionsTotal - fractionsVenduesLocked;
      if (disponiblesLocked <= 0) {
        throw new BadRequestException(
          'Il ne reste plus de fractions disponibles sur ce projet.',
        );
      }
      if (nbFractions > disponiblesLocked) {
        throw new BadRequestException(
          `Seulement ${disponiblesLocked} fraction(s) disponible(s) sur ce projet`,
        );
      }

      // 3. Verrou sur la ligne wallet + re-vérification du solde SOUS VERROU.
      const walletRow = await manager.findOne(WalletEntity, {
        where: { id: wallet.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!walletRow) {
        throw new BadRequestException(
          "Wallet introuvable. Veuillez alimenter votre compte avant d'investir.",
        );
      }
      if (Number(walletRow.solde) < montantDelta) {
        throw new BadRequestException(
          `Solde insuffisant. Disponible : ${formatEur(Number(walletRow.solde))} — Requis : ${formatEur(montantDelta)}`,
        );
      }

      // 4. Mise à jour de l'investissement (nbTitres + montant).
      await manager.update(InvestmentEntity, investmentId, {
        nbTitres: newNbTitres,
        montant: newMontant,
      });

      // 5. Débit du wallet SOUS VERROU.
      walletRow.solde = Number(walletRow.solde) - montantDelta;
      await manager.save(WalletEntity, walletRow);

      // 5 bis. Contrepartie du débit — GRAND LIVRE INTERNE. Un ajout de
      //    fractions ne porte que sur un investissement CONFIRMÉ (contrôlé plus
      //    haut) : l'engagement est définitif, les fonds sont donc acquis au
      //    projet dès maintenant et crédités sur son wallet technique.
      const walletProjet =
        await this.projectWalletResolver.executeInTransaction(
          manager,
          investment.projetId,
          { devise: walletRow.devise },
        );
      walletProjet.solde = Number(walletProjet.solde) + montantDelta;
      await manager.save(WalletEntity, walletProjet);

      // 6. Écriture de la transaction ledger (double entrée : le débit
      //    investisseur a pour contrepartie le crédit du wallet projet).
      const tx = new Transaction();
      tx.walletSource = wallet.id;
      tx.walletDestination = walletProjet.id;
      tx.type = TransactionType.SOUSCRIPTION;
      tx.montant = montantDelta;
      tx.devise = wallet.devise;
      tx.statut = TransactionStatus.REUSSI;
      tx.fournisseur = TransactionFournisseur.INTERNE;
      tx.referenceExterne = null;
      tx.investissementId = investmentId;
      tx.echeanceId = null;
      tx.reservationId = null;
      tx.projetId = investment.projetId;
      // Clé du client si fournie (idempotence adossée à la contrainte d'unicité
      // en base) ; sinon clé horodatée, qui trace sans jamais entrer en collision.
      tx.idempotencyKey = idempotencyKey
        ? TopUpInvestmentUseCase.cleIdempotence(userId, investmentId, idempotencyKey)
        : `topup:${userId}:${investmentId}:${Date.now()}`;
      tx.fraisPsp = 0;
      tx.fraisPlateforme = 0;
      tx.metadata = null;
      tx.motifEchec = null;
      await manager.save(TransactionEntity, WalletMapper.txToEntity(tx));

      // 7. Régénération de l'échéancier avec les nouveaux totaux.
      await manager.delete(EcheanceEntity, { investissementId: investmentId });
      const echeances = this.generateEcheances(
        investmentId,
        newMontant,
        Number((project as any).triCible ?? 0),
        Number((project as any).dureeMois ?? 12),
        RemboursementMode.IN_FINE,
      );
      await manager.save(
        EcheanceEntity,
        echeances.map(InvestmentMapper.echeanceToEntity),
      );

      // Domaine renvoyé : investissement existant enrichi des nouveaux totaux
      // (la relation projet est déjà chargée sur `investment`).
      const updatedDomain = Object.assign(new Investment(), investment, {
        nbTitres: newNbTitres,
        montant: newMontant,
      });
      return updatedDomain;
    });
  }

  private async regenerateBulletin(investment: Investment, project: any, userId: number): Promise<void> {
    const oldBulletinDocId = investment.bulletinDocId ?? null;

    const user = await this.userRepository.findById(userId);
    const firstname = user?.firstname ?? 'Investisseur';
    const lastname = user?.lastname ?? '';
    const email = user?.email ?? '';

    const pdfBuffer = await this.contractGenerator.generateBulletin({
      investment,
      projectTitle: project.titre,
      projectVille: project.ville ?? '',
      projectPays: project.pays,
      investorFirstname: firstname,
      investorLastname: lastname,
      investorEmail: email,
      triCible: Number(project.triCible ?? 0),
      dureeMois: Number(project.dureeMois),
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
    await this.investmentRepository.updateBulletinDocId(investment.id, savedDoc.id);
    this.logger.log(`Top-up bulletin regenerated: investmentId=${investment.id} docId=${savedDoc.id}`);

    // Overwrite policy: delete the previous bulletin so only the current one remains
    if (oldBulletinDocId && oldBulletinDocId !== savedDoc.id) {
      try {
        const oldDoc = await this.documentRepository.findById(oldBulletinDocId);
        if (oldDoc) {
          await this.cloudStorage.delete(oldDoc.filename).catch(() => {});
          await this.documentRepository.delete(oldBulletinDocId);
          this.logger.log(`Previous bulletin deleted: docId=${oldBulletinDocId}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to delete previous bulletin ${oldBulletinDocId}: ${err?.message ?? err}`);
      }
    }
  }

  private generateEcheances(
    investissementId: string,
    montant: number,
    triAnnuel: number,
    dureeMois: number,
    mode: RemboursementMode,
  ): Echeance[] {
    const echeances: Echeance[] = [];
    const tauxMensuel = triAnnuel / 100 / 12;
    const now = new Date();

    if (mode === RemboursementMode.IN_FINE) {
      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = new Date(now);
        datePrevue.setMonth(datePrevue.getMonth() + i);
        const ech = new Echeance();
        ech.investissementId = investissementId;
        ech.numero = i;
        ech.datePrevue = datePrevue;
        ech.montantCapital = i === dureeMois ? montant : 0;
        ech.montantInterets = Math.round(montant * tauxMensuel * 100) / 100;
        ech.montantTotal = ech.montantCapital + ech.montantInterets;
        ech.statut = EcheanceStatus.A_VENIR;
        ech.payeLe = null;
        echeances.push(ech);
      }
    } else {
      const capitalMensuel = montant / dureeMois;
      let solde = montant;
      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = new Date(now);
        datePrevue.setMonth(datePrevue.getMonth() + i);
        const interets = Math.round(solde * tauxMensuel * 100) / 100;
        const capital = Math.round(capitalMensuel * 100) / 100;
        const ech = new Echeance();
        ech.investissementId = investissementId;
        ech.numero = i;
        ech.datePrevue = datePrevue;
        ech.montantCapital = capital;
        ech.montantInterets = interets;
        ech.montantTotal = capital + interets;
        ech.statut = EcheanceStatus.A_VENIR;
        ech.payeLe = null;
        echeances.push(ech);
        solde -= capital;
      }
    }

    return echeances;
  }
}
