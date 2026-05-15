import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { InvestmentRepository } from '../ports/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../ports/repositories/investment.repository';
import type { ProjectRepository } from 'src/projects/applications/ports/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/projects/applications/ports/repositories/project.repository';
import type { WalletRepository } from 'src/wallets/applications/ports/repositories/wallet.repository';
import { WALLET_REPOSITORY } from 'src/wallets/applications/ports/repositories/wallet.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { UserRepository } from 'src/users/applications/ports/repositories/user.repository';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';
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
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import { Document } from 'src/documents/domains/document';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';
import { Investment } from 'src/investments/domains/investment';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';

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
  ) {}

  async execute(
    investmentId: string,
    userId: number,
    nbFractions: number,
  ): Promise<Investment> {
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
        `Solde insuffisant. Disponible : ${wallet.solde} XOF — Requis : ${montantDelta} XOF`,
      );
    }

    const newNbTitres = (investment.nbTitres ?? 0) + nbFractions;
    const newMontant = Number(investment.montant) + montantDelta;

    const updated = await this.investmentRepository.updateTopUp(investmentId, newNbTitres, newMontant);

    // Deduct wallet atomically
    await this.walletRepository.updateSolde(wallet.id, -montantDelta);

    // Record ledger transaction
    const tx = new Transaction();
    tx.walletSource = wallet.id;
    tx.walletDestination = null;
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
    tx.idempotencyKey = `topup:${userId}:${investmentId}:${Date.now()}`;
    tx.fraisPsp = 0;
    tx.fraisPlateforme = 0;
    tx.metadata = null;
    tx.motifEchec = null;
    await this.walletRepository.saveTransaction(tx);

    // Regenerate schedule from scratch with new totals
    await this.investmentRepository.deleteEcheancesByInvestissementId(investmentId);
    const echeances = this.generateEcheances(
      investmentId,
      newMontant,
      Number((project as any).triCible ?? 0),
      Number((project as any).dureeMois ?? 12),
      RemboursementMode.IN_FINE,
    );
    await this.investmentRepository.saveEcheances(echeances);

    // Async bulletin regeneration (non-blocking)
    this.regenerateBulletin(updated, project, userId).catch((err) =>
      this.logger.error(`Top-up bulletin regen failed for ${investmentId}: ${err?.message}`),
    );

    // In-app notification (non-blocking)
    this.notificationService.push({
      utilisateurId: userId,
      type: NotificationType.INVESTISSEMENT,
      titre: 'Fractions ajoutées',
      message: `+${nbFractions} fraction${nbFractions > 1 ? 's' : ''} ajoutée${nbFractions > 1 ? 's' : ''} dans "${project.titre}". Vous détenez désormais ${newNbTitres} fraction${newNbTitres > 1 ? 's' : ''} (${montantDelta} XOF débités).`,
      metadata: { investissementId: investmentId, projetId: investment.projetId, nbFractions, montantDelta, newNbTitres },
    }).catch(() => {});

    return updated;
  }

  private async regenerateBulletin(investment: Investment, project: any, userId: number): Promise<void> {
    const oldBulletinDocId = investment.bulletinDocId ?? null;

    const user = await this.userRepository.findById(userId);
    const firstname = user?.firstname ?? 'Investisseur';
    const lastname = user?.lastname ?? '';
    const email = user?.userEmail?.email ?? '';

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
