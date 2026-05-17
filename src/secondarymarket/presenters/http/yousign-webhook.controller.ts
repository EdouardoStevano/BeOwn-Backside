import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus, EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import type { UserRepository } from 'src/users/applications/ports/repositories/user.repository';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';

@ApiExcludeController()
@SkipThrottle()
@Controller('webhooks/yousign')
export class YouSignWebhookController {
  private readonly logger = new Logger(YouSignWebhookController.name);

  constructor(
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly youSignService: YouSignService,
    private readonly notificationService: NotificationService,
    private readonly cloudStorage: CloudStorageService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Body() payload: any,
    @Headers('x-yousign-signature-256') signature: string,
  ) {
    const rawBody = (req.rawBody as Buffer | undefined)?.toString('utf-8') ?? JSON.stringify(payload);

    if (!this.youSignService.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Invalid YouSign webhook signature — ignored');
      return { received: false };
    }

    const event = payload?.event_name as string;
    const requestId = payload?.data?.signature_request?.id as string;

    this.logger.log(`YouSign webhook: event=${event} requestId=${requestId}`);

    if (!requestId) return { received: true };

    if (event === 'signature_request.done') {
      await this.handleSignatureDone(requestId).catch((err) =>
        this.logger.error(`handleSignatureDone failed for ${requestId}: ${err?.message}`, err?.stack),
      );
    } else if (event === 'signature_request.expired') {
      await this.handleSignatureExpired(requestId).catch((err) =>
        this.logger.error(`handleSignatureExpired failed for ${requestId}: ${err?.message}`),
      );
    }

    return { received: true };
  }

  // ── Signature complète → finaliser la transaction ────────────────────────────

  async handleSignatureDone(youSignRequestId: string): Promise<void> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!signature) {
      this.logger.warn(`No signature found for YouSign request ${youSignRequestId}`);
      return;
    }
    if (signature.statut !== SignatureStatus.PENDING) {
      this.logger.log(`Signature ${signature.id} already processed (${signature.statut})`);
      return;
    }

    // Marquer signée immédiatement (évite double-traitement)
    signature.statut = SignatureStatus.SIGNED;
    signature.signedAt = new Date();
    await this.signatureRepo.save(signature);

    // Branch: souscription initiale (ordreId = null) vs marché secondaire
    if (signature.ordreId === null) {
      await this.handleInvestmentSignatureDone(signature).catch((err) =>
        this.logger.error(`handleInvestmentSignatureDone failed: ${err?.message}`, err?.stack),
      );
      return;
    }

    // Exécuter la transaction dans une transaction DB atomique
    const { buyerInvestId, fusionnee } = await this.dataSource.transaction(async (em) => {
      const ordre = await em.findOne(OrdreMarcheEntity, {
        where: { id: signature.ordreId! },
        relations: ['investissement'],
      });
      if (!ordre) throw new Error(`Ordre ${signature.ordreId} introuvable`);

      const nbFractions = signature.nbFractions!;
      const projetId = ordre.investissement.projetId;
      const prixUnitaire = Number(ordre.prixUnitaire);
      const montantTotal = nbFractions * prixUnitaire;
      const buyerUserId = signature.userId;

      // 1. Vérifier/obtenir wallet acheteur
      const buyerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: buyerUserId, type: WalletType.INVESTISSEUR },
      });
      if (!buyerWallet) throw new Error(`Wallet acheteur ${buyerUserId} introuvable`);
      if (Number(buyerWallet.solde) < montantTotal) {
        throw new Error(`Solde insuffisant pour acheteur ${buyerUserId}: ${buyerWallet.solde} < ${montantTotal}`);
      }

      // 2. Wallet vendeur
      const sellerWallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: ordre.vendeurId, type: WalletType.INVESTISSEUR },
      });

      // 3. Cas A (investi) ou Cas B (nouvel investissement)
      let buyerInvest: InvestmentEntity;
      const existingInvest = signature.investmentId
        ? await em.findOne(InvestmentEntity, { where: { id: signature.investmentId } })
        : null;

      if (existingInvest) {
        existingInvest.nbTitres = (Number(existingInvest.nbTitres) ?? 0) + nbFractions;
        existingInvest.montant = Number(existingInvest.montant) + montantTotal;
        existingInvest.signatureId = signature.id;
        buyerInvest = await em.save(InvestmentEntity, existingInvest);
      } else {
        const sellerInvest = ordre.investissement;
        const newInvest = em.create(InvestmentEntity, {
          projetId,
          utilisateurId: buyerUserId,
          montant: montantTotal,
          instrument: sellerInvest.instrument,
          nbTitres: nbFractions,
          valeurTitre: prixUnitaire,
          statut: InvestmentStatus.CONFIRME,
          signatureId: signature.id,
        });
        buyerInvest = await em.save(InvestmentEntity, newInvest);
      }

      // 4. Lier le document au bon investissement
      if (signature.documentId) {
        await em.update(DocumentEntity, { id: signature.documentId }, {
          investmentId: buyerInvest.id,
        });
      }

      // 5. Réduire les fractions du vendeur
      const sellerInvest = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (sellerInvest && sellerInvest.nbTitres != null) {
        const remaining = Number(sellerInvest.nbTitres) - nbFractions;
        sellerInvest.nbTitres = Math.max(0, remaining);
        sellerInvest.montant = remaining > 0
          ? Number(sellerInvest.montant) - montantTotal
          : 0;
        await em.save(InvestmentEntity, sellerInvest);
      }

      // 6. Mettre à jour l'ordre
      if (nbFractions >= ordre.nbFractions) {
        ordre.acheteurId = buyerUserId;
        ordre.statut = OrdreMarcheStatus.EXECUTE;
      } else {
        ordre.nbFractions = ordre.nbFractions - nbFractions;
        ordre.montant = Number(ordre.montant) - montantTotal;
      }
      await em.save(OrdreMarcheEntity, ordre);

      // 7. Débiter wallet acheteur
      buyerWallet.solde = Number(buyerWallet.solde) - montantTotal;
      await em.save(WalletEntity, buyerWallet);

      // 8. Créditer wallet vendeur
      if (sellerWallet) {
        sellerWallet.solde = Number(sellerWallet.solde) + montantTotal;
        await em.save(WalletEntity, sellerWallet);
      }

      // 9. Transaction ledger acheteur
      const txBuyer = em.create(TransactionEntity, {
        walletSource: buyerWallet.id,
        walletDestination: sellerWallet?.id ?? null,
        type: TransactionType.SOUSCRIPTION,
        montant: montantTotal,
        devise: buyerWallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        investissementId: buyerInvest.id,
        projetId,
        idempotencyKey: `rachat:buyer:${signature.id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      });
      await em.save(TransactionEntity, txBuyer);

      // 10. Transaction ledger vendeur
      if (sellerWallet) {
        const txSeller = em.create(TransactionEntity, {
          walletSource: null,
          walletDestination: sellerWallet.id,
          type: TransactionType.SOUSCRIPTION,
          montant: montantTotal,
          devise: sellerWallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: ordre.investissementId,
          projetId,
          idempotencyKey: `rachat:seller:${signature.id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
        });
        await em.save(TransactionEntity, txSeller);
      }

      return { buyerInvestId: buyerInvest.id, fusionnee: !!existingInvest };
    });

    // Remplacer le PDF unsigné par la version signée YouSign (parité avec
    // l'investissement primaire) — l'acheteur voit ainsi son vrai contrat de
    // Cession dans "Mes Investissements".
    try {
      if (signature.documentId) {
        const signedPdf = await this.youSignService.downloadSignedDocument(signature.youSignRequestId);
        const filename = `contrat_cession_${buyerInvestId.slice(0, 8)}_${signature.userId}_${Date.now()}.pdf`;
        const { objectName, publicUrl } = await this.cloudStorage.upload(
          signedPdf,
          filename,
          'application/pdf',
          'contrats',
        );
        await this.documentRepo.update(
          { id: signature.documentId },
          { filename: objectName, path: publicUrl, originalName: filename, sizeBytes: signedPdf.length },
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not store signed cession PDF for investment ${buyerInvestId}: ${err?.message}`);
    }

    // Notifications (non-bloquantes)
    const ordre = await this.ordreRepo.findOne({
      where: { id: signature.ordreId! },
      relations: ['investissement'],
    });
    const nbFractions = signature.nbFractions!;

    if (ordre) {
      this.notificationService.push({
        utilisateurId: ordre.vendeurId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Vente exécutée',
        message: `${nbFractions} fraction${nbFractions > 1 ? 's' : ''} ont été achetées et le paiement a été crédité sur votre wallet.`,
        metadata: { ordreId: ordre.id, nbFractions },
      }).catch(() => {});

      this.notificationService
        .pushToAdmins({
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Vente marché secondaire',
          message: `User #${signature.userId} a acheté ${nbFractions} fraction(s) à User #${ordre.vendeurId}.`,
          roles: [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
          metadata: { ordreId: ordre.id, buyerInvestId, sellerId: ordre.vendeurId, buyerId: signature.userId, nbFractions },
        })
        .catch(() => {});

      const projectEntity = await this.projectRepo.findOne({
        where: { id: ordre.investissement.projetId },
      });
      const buyerUser = await this.userRepository.findById(signature.userId);
      const sellerUser = await this.userRepository.findById(ordre.vendeurId);
      if (projectEntity && buyerUser && sellerUser) {
        await this.notificationEvents.secondaryTradeExecuted(
          ordre, projectEntity, buyerUser, sellerUser, nbFractions,
        );
      }
    }

    this.logger.log(`Signature done: investmentId=${buyerInvestId} fusionnee=${fusionnee}`);
  }

  // ── Souscription initiale signée → débiter + confirmer ───────────────────────

  private async handleInvestmentSignatureDone(signature: SignatureEntity): Promise<void> {
    const investment = await this.investRepo.findOne({
      where: { id: signature.investmentId! },
    });
    if (!investment) {
      this.logger.warn(`Investment ${signature.investmentId} not found for signature ${signature.id}`);
      return;
    }
    if (investment.statut !== InvestmentStatus.INITIE) {
      this.logger.log(`Investment ${investment.id} already processed (${investment.statut})`);
      return;
    }

    const project = await this.projectRepo.findOne({ where: { id: investment.projetId } });
    const montant = Number(investment.montant);

    await this.dataSource.transaction(async (em) => {
      const wallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: investment.utilisateurId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new Error(`Wallet introuvable pour user ${investment.utilisateurId}`);
      if (Number(wallet.solde) < montant) {
        throw new Error(`Solde insuffisant: ${wallet.solde} < ${montant}`);
      }

      // Confirmer l'investissement
      investment.statut = InvestmentStatus.CONFIRME;
      investment.signatureId = signature.id;
      await em.save(InvestmentEntity, investment);

      // Débiter wallet
      wallet.solde = Number(wallet.solde) - montant;
      await em.save(WalletEntity, wallet);

      // Transaction ledger
      const tx = em.create(TransactionEntity, {
        walletSource: wallet.id,
        walletDestination: null,
        type: TransactionType.SOUSCRIPTION,
        montant,
        devise: wallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        investissementId: investment.id,
        projetId: investment.projetId,
        idempotencyKey: `invest:${investment.utilisateurId}:${investment.id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      });
      await em.save(TransactionEntity, tx);

      // Générer les écheances (in_fine par défaut)
      if (project) {
        const echeances = this.buildEcheances(
          investment.id,
          montant,
          Number(project.triCible ?? 0),
          Number(project.dureeMois),
        );
        await em.save(EcheanceEntity, echeances);
      }

      // Auto-transition FINANCE si toutes les fractions sont vendues
      if (project) {
        const prixFraction = Number(project.ticketMinimum);
        const nbFractionsTotal = project.nbFractions ?? Math.floor(Number(project.capitalCible) / prixFraction);
        const totalVendues = await em
          .createQueryBuilder(InvestmentEntity, 'inv')
          .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
          .where('inv.projetId = :projetId', { projetId: investment.projetId })
          .andWhere('inv.statut NOT IN (:...excluded)', {
            excluded: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE, InvestmentStatus.INITIE],
          })
          .getRawOne()
          .then((r) => Number(r?.total ?? 0));

        if (totalVendues >= nbFractionsTotal) {
          await em.update(ProjectEntity, { id: investment.projetId }, { statut: ProjectStatus.FINANCE });
        }
      }
    });

    // Replace unsigned PDF with the signed version from YouSign
    try {
      const signedPdf = await this.youSignService.downloadSignedDocument(signature.youSignRequestId);
      const filename = `contrat_signe_${investment.id.slice(0, 8)}_${investment.utilisateurId}_${Date.now()}.pdf`;
      const { objectName, publicUrl } = await this.cloudStorage.upload(signedPdf, filename, 'application/pdf', 'contrats');
      if (signature.documentId) {
        await this.documentRepo.update(
          { id: signature.documentId },
          { filename: objectName, path: publicUrl, originalName: filename, sizeBytes: signedPdf.length },
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not store signed PDF for investment ${investment.id}: ${err?.message}`);
    }

    // Notify via facade (handles both user + admin)
    const user = await this.userRepository.findById(investment.utilisateurId);
    if (project && user) {
      this.notificationEvents.investmentCreated(investment, project, user);
    }

    this.notificationService
      .pushToAdmins({
        type: NotificationType.INVESTISSEMENT,
        titre: 'Nouvel investissement',
        message: `User #${investment.utilisateurId} a investi ${montant} XOF dans "${project?.titre ?? 'projet'}".`,
        roles: [UserRole.ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: { investissementId: investment.id, projetId: investment.projetId, montant, userId: investment.utilisateurId },
      })
      .catch(() => {});

    this.logger.log(`Investment signature done: investmentId=${investment.id} userId=${investment.utilisateurId}`);
  }

  private buildEcheances(
    investissementId: string,
    montant: number,
    triAnnuel: number,
    dureeMois: number,
  ): Partial<EcheanceEntity>[] {
    const tauxMensuel = triAnnuel / 100 / 12;
    const now = new Date();
    const echeances: Partial<EcheanceEntity>[] = [];

    for (let i = 1; i <= dureeMois; i++) {
      const datePrevue = new Date(now);
      datePrevue.setMonth(datePrevue.getMonth() + i);
      echeances.push({
        investissementId,
        numero: i,
        datePrevue,
        montantCapital: i === dureeMois ? montant : 0,
        montantInterets: Math.round(montant * tauxMensuel * 100) / 100,
        montantTotal: (i === dureeMois ? montant : 0) + Math.round(montant * tauxMensuel * 100) / 100,
        statut: EcheanceStatus.A_VENIR,
        payeLe: null,
      });
    }
    return echeances;
  }

  // ── Signature expirée → libérer l'ordre ─────────────────────────────────────

  private async handleSignatureExpired(youSignRequestId: string): Promise<void> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!signature || signature.statut !== SignatureStatus.PENDING) return;

    signature.statut = SignatureStatus.EXPIRED;
    await this.signatureRepo.save(signature);

    this.notificationService.push({
      utilisateurId: signature.userId,
      type: NotificationType.MARCHE_SECONDAIRE,
      titre: 'Signature expirée',
      message: 'Votre contrat de rachat a expiré (48h dépassées). L\'ordre est toujours disponible si vous souhaitez réessayer.',
      metadata: { ordreId: signature.ordreId, signatureId: signature.id },
    }).catch(() => {});

    this.logger.log(`Signature expired: ${signature.id} ordreId=${signature.ordreId}`);
  }
}
