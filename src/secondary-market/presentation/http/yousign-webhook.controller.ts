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
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { SignatureStatus } from 'src/documents/domain/enums/signature-status.enum';
import { SignatureOrmMapper } from 'src/documents/infrastructure/persistence/mappers/signature.orm-mapper';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistence/entities/document.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { EcheanceStatus } from 'src/servicing/domain/enums/echeance.enum';
import { OrdreMarcheStatus } from 'src/secondary-market/domain/enums/ordre-marche.enum';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { round2 } from 'src/common/platform-fees/platform-fees.constants';
import { formatEur } from 'src/shared/money/format-eur';
import { computeCoutAcquisition } from 'src/secondary-market/domain/services/cout-acquisition';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { USER_REPOSITORY } from 'src/iam/domain/repositories/user.repository';

/**
 * Résultat de l'exécution atomique d'une signature `signature_request.done`.
 * Porte les données nécessaires aux effets de bord POST-transaction (PDF signé,
 * notifications) sans les exécuter dans la transaction.
 */
type SignatureDoneResult =
  | { branch: 'noop' }
  | {
      branch: 'investment';
      investment: InvestmentEntity;
      project: ProjectEntity | null;
      montant: number;
    }
  | { branch: 'secondary'; buyerInvestId: string; fusionnee: boolean };

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
    private readonly platformFees: PlatformFeesService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Body() payload: any,
    @Headers('x-yousign-signature-256') signature: string,
  ) {
    const rawBody =
      (req.rawBody as Buffer | undefined)?.toString('utf-8') ??
      JSON.stringify(payload);

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
        this.logger.error(
          `handleSignatureDone failed for ${requestId}: ${err?.message}`,
          err?.stack,
        ),
      );
    } else if (event === 'signature_request.expired') {
      await this.handleSignatureExpired(requestId).catch((err) =>
        this.logger.error(
          `handleSignatureExpired failed for ${requestId}: ${err?.message}`,
        ),
      );
    }

    return { received: true };
  }

  // ── Signature complète → finaliser la transaction (atomique) ─────────────────
  //
  // Invariant sécurité : la signature n'est marquée SIGNED qu'APRÈS l'exécution
  // complète, DANS la même transaction. La ligne signature est verrouillée
  // (pessimistic_write) puis relue SOUS VERROU : deux livraisons concurrentes du
  // webhook se sérialisent, la seconde voit un statut != PENDING et n'exécute
  // rien. Si une étape échoue, toute la transaction est annulée → la signature
  // reste PENDING → un rejeu du webhook ré-exécute (plus de « fire-and-forget »
  // qui laissait la signature SIGNED sur un traitement échoué).

  async handleSignatureDone(youSignRequestId: string): Promise<void> {
    const existing = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!existing) {
      this.logger.warn(
        `No signature found for YouSign request ${youSignRequestId}`,
      );
      return;
    }
    if (existing.statut !== SignatureStatus.PENDING) {
      this.logger.log(
        `Signature ${existing.id} already processed (${existing.statut})`,
      );
      return;
    }

    // Snapshot des taux lu UNE fois pour toute l'opération marché secondaire
    // (cohérence R1 : pas de dérive si un admin modifie les commissions pendant
    // le traitement). Non requis pour la souscription initiale.
    const feeRates =
      existing.ordreId === null ? null : await this.platformFees.getRates();

    const result = await this.dataSource.transaction(
      async (em): Promise<SignatureDoneResult> => {
        // Verrou pessimiste sur la ligne signature + relecture du statut SOUS
        // VERROU : sérialise les livraisons concurrentes du webhook.
        const signature = await em.findOne(SignatureEntity, {
          where: { youSignRequestId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!signature || signature.statut !== SignatureStatus.PENDING) {
          return { branch: 'noop' };
        }

        // Souscription initiale (ordreId = null) → exécution atomique dédiée, puis
        // SIGNED en dernier dans la même transaction.
        if (signature.ordreId === null) {
          const out = await this.executeInvestmentSignature(em, signature);
          await this.acterSignature(em, signature);
          return out;
        }

        // ── Marché secondaire : rachat de fractions ───────────────────────────
        const ordre = await em.findOne(OrdreMarcheEntity, {
          where: { id: signature.ordreId! },
          relations: ['investissement'],
        });
        if (!ordre) throw new Error(`Ordre ${signature.ordreId} introuvable`);

        const nbFractions = signature.nbFractions!;
        const projetId = ordre.investissement.projetId;
        const prixUnitaire = Number(ordre.prixUnitaire);
        const montantTotal = round2(nbFractions * prixUnitaire);
        // Plus-value vendeur = prix de vente − coût d'acquisition des parts
        // vendues (coût moyen pondéré — voir domains/cout-acquisition.ts).
        // Calculée AVANT la réduction de l'investissement vendeur (étape 5).
        const coutAcquisition = computeCoutAcquisition(
          ordre.investissement,
          nbFractions,
          prixUnitaire,
        );
        const plusValueVendeur = round2(montantTotal - coutAcquisition);
        // Frais vendeur : % du montant de la vente + % de la plus-value.
        const { transactionFee, gainFee } =
          await this.platformFees.computeResaleFees(
            montantTotal,
            plusValueVendeur,
            // Non-null dans la branche marché secondaire (ordreId != null).
            feeRates!,
          );
        const totalFrais = round2(transactionFee + gainFee);
        const montantNetVendeur = round2(montantTotal - totalFrais);
        const buyerUserId = signature.userId;

        // 1. Vérifier/obtenir wallet acheteur
        const buyerWallet = await em.findOne(WalletEntity, {
          where: {
            proprietaireUserId: buyerUserId,
            type: WalletType.INVESTISSEUR,
          },
        });
        if (!buyerWallet)
          throw new Error(`Wallet acheteur ${buyerUserId} introuvable`);
        if (Number(buyerWallet.solde) < montantTotal) {
          throw new Error(
            `Solde insuffisant pour acheteur ${buyerUserId}: ${buyerWallet.solde} < ${montantTotal}`,
          );
        }

        // 2. Wallet vendeur
        const sellerWallet = await em.findOne(WalletEntity, {
          where: {
            proprietaireUserId: ordre.vendeurId,
            type: WalletType.INVESTISSEUR,
          },
        });

        // 3. Cas A (investi) ou Cas B (nouvel investissement)
        let buyerInvest: InvestmentEntity;
        const existingInvest = signature.investmentId
          ? await em.findOne(InvestmentEntity, {
              where: { id: signature.investmentId },
            })
          : null;

        if (existingInvest) {
          existingInvest.nbTitres =
            (Number(existingInvest.nbTitres) ?? 0) + nbFractions;
          existingInvest.montant =
            Number(existingInvest.montant) + montantTotal;
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
          await em.update(
            DocumentEntity,
            { id: signature.documentId },
            {
              investmentId: buyerInvest.id,
            },
          );
        }

        // 5. Réduire les fractions du vendeur
        const sellerInvest = await em.findOne(InvestmentEntity, {
          where: { id: ordre.investissementId },
        });
        if (sellerInvest && sellerInvest.nbTitres != null) {
          const remaining = Number(sellerInvest.nbTitres) - nbFractions;
          sellerInvest.nbTitres = Math.max(0, remaining);
          sellerInvest.montant =
            remaining > 0 ? Number(sellerInvest.montant) - montantTotal : 0;
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

        // 7. Débiter wallet acheteur (montant total)
        buyerWallet.solde = Number(buyerWallet.solde) - montantTotal;
        await em.save(WalletEntity, buyerWallet);

        // 8. Créditer wallet vendeur (net des frais vendeur)
        if (sellerWallet) {
          sellerWallet.solde = Number(sellerWallet.solde) + montantNetVendeur;
          await em.save(WalletEntity, sellerWallet);
        }

        // 9. Créditer wallet plateforme (frais de transaction + frais sur gain)
        // Wallet system-wide, créé à la volée si absent (parité avec SEQUESTRE_IR/CSG).
        let platformWallet: WalletEntity | null = null;
        if (totalFrais > 0) {
          platformWallet = await em.findOne(WalletEntity, {
            where: { type: WalletType.FRAIS_PLATEFORME },
          });
          if (!platformWallet) {
            platformWallet = await em.save(
              WalletEntity,
              em.create(WalletEntity, {
                type: WalletType.FRAIS_PLATEFORME,
                proprietaireUserId: null,
                fournisseurRef: 'PLAT-FEES-001',
                devise: buyerWallet.devise,
                solde: 0,
              }),
            );
          }
          platformWallet.solde = Number(platformWallet.solde) + totalFrais;
          await em.save(WalletEntity, platformWallet);
        }

        // 10. Transaction ledger acheteur
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
          fraisPlateforme: totalFrais,
        });
        await em.save(TransactionEntity, txBuyer);

        // 11. Transaction ledger vendeur (net des frais)
        if (sellerWallet) {
          const txSeller = em.create(TransactionEntity, {
            walletSource: null,
            walletDestination: sellerWallet.id,
            type: TransactionType.SOUSCRIPTION,
            montant: montantNetVendeur,
            devise: sellerWallet.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: ordre.investissementId,
            projetId,
            idempotencyKey: `rachat:seller:${signature.id}`,
            fraisPsp: 0,
            fraisPlateforme: totalFrais,
          });
          await em.save(TransactionEntity, txSeller);
        }

        // 12. Transactions ledger frais plateforme — une par frais.
        // Clés scoppées par signature (un ordre peut être exécuté en plusieurs
        // fills partiels) ; metadata.ordreId permet le lookup au reverse admin.
        if (platformWallet && transactionFee > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: null,
              walletDestination: platformWallet.id,
              type: TransactionType.SOUSCRIPTION,
              montant: transactionFee,
              devise: platformWallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: ordre.investissementId,
              projetId,
              idempotencyKey: `secmarket:fee:revente_transaction:sig:${signature.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'revente_transaction',
                ordreId: ordre.id,
                signatureId: signature.id,
              },
            }),
          );
        }
        if (platformWallet && gainFee > 0) {
          await em.save(
            TransactionEntity,
            em.create(TransactionEntity, {
              walletSource: null,
              walletDestination: platformWallet.id,
              type: TransactionType.SOUSCRIPTION,
              montant: gainFee,
              devise: platformWallet.devise,
              statut: TransactionStatus.REUSSI,
              fournisseur: TransactionFournisseur.INTERNE,
              investissementId: ordre.investissementId,
              projetId,
              idempotencyKey: `secmarket:fee:gain_revente_actions:sig:${signature.id}`,
              fraisPsp: 0,
              fraisPlateforme: 0,
              metadata: {
                source: 'gain_revente_actions',
                ordreId: ordre.id,
                signatureId: signature.id,
                plusValueVendeur,
                coutAcquisition,
              },
            }),
          );
        }

        // Statut SIGNED posé en DERNIER, dans la même transaction que l'exécution.
        await this.acterSignature(em, signature);

        return {
          branch: 'secondary',
          buyerInvestId: buyerInvest.id,
          fusionnee: !!existingInvest,
        };
      },
    );

    // ── Effets de bord best-effort, HORS transaction ──────────────────────────
    if (result.branch === 'investment') {
      await this.finalizeInvestmentSideEffects(
        existing,
        result.investment,
        result.project,
        result.montant,
      );
      return;
    }
    if (result.branch !== 'secondary') return;

    // Alias : réutilise verbatim le bloc d'effets de bord marché secondaire.
    const signature = existing;
    const { buyerInvestId, fusionnee } = result;

    // Remplacer le PDF unsigné par la version signée YouSign (parité avec
    // l'investissement primaire) — l'acheteur voit ainsi son vrai contrat de
    // Cession dans "Mes Investissements".
    try {
      if (signature.documentId) {
        const signedPdf = await this.youSignService.downloadSignedDocument(
          signature.youSignRequestId,
        );
        const filename = `contrat_cession_${buyerInvestId.slice(0, 8)}_${signature.userId}_${Date.now()}.pdf`;
        const { objectName, publicUrl } = await this.cloudStorage.upload(
          signedPdf,
          filename,
          'application/pdf',
          'contrats',
        );
        await this.documentRepo.update(
          { id: signature.documentId },
          {
            filename: objectName,
            path: publicUrl,
            originalName: filename,
            sizeBytes: signedPdf.length,
          },
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Could not store signed cession PDF for investment ${buyerInvestId}: ${err?.message}`,
      );
    }

    // Notifications (non-bloquantes)
    const ordre = await this.ordreRepo.findOne({
      where: { id: signature.ordreId! },
      relations: ['investissement'],
    });
    const nbFractions = signature.nbFractions!;

    if (ordre) {
      this.notificationService
        .push({
          utilisateurId: ordre.vendeurId,
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Vente exécutée',
          message: `${nbFractions} fraction${nbFractions > 1 ? 's' : ''} ont été achetées et le paiement a été crédité sur votre wallet.`,
          metadata: { ordreId: ordre.id, nbFractions },
        })
        .catch(() => {});

      this.notificationService
        .pushToAdmins({
          type: NotificationType.MARCHE_SECONDAIRE,
          titre: 'Vente marché secondaire',
          message: `User #${signature.userId} a acheté ${nbFractions} fraction(s) à User #${ordre.vendeurId}.`,
          roles: [
            UserRole.SUPER_ADMIN,
            UserRole.FINANCIER,
            UserRole.COMPLIANCE,
          ],
          metadata: {
            ordreId: ordre.id,
            buyerInvestId,
            sellerId: ordre.vendeurId,
            buyerId: signature.userId,
            nbFractions,
          },
        })
        .catch(() => {});

      const projectEntity = await this.projectRepo.findOne({
        where: { id: ordre.investissement.projetId },
      });
      const buyerUser = await this.userRepository.findById(signature.userId);
      const sellerUser = await this.userRepository.findById(ordre.vendeurId);
      if (projectEntity && buyerUser && sellerUser) {
        await this.notificationEvents.secondaryTradeExecuted(
          ordre,
          projectEntity,
          buyerUser,
          sellerUser,
          nbFractions,
        );
      }
    }

    this.logger.log(
      `Signature done: investmentId=${buyerInvestId} fusionnee=${fusionnee}`,
    );
  }

  // ── Souscription initiale signée → débiter + confirmer (exécution atomique) ──
  //
  // Exécuté DANS la transaction de handleSignatureDone (manager `em` partagé) :
  // débit du wallet, confirmation, écheances et transition FINANCE sont annulés
  // ensemble si une étape échoue — la signature reste alors PENDING.

  private async executeInvestmentSignature(
    em: EntityManager,
    signature: SignatureEntity,
  ): Promise<SignatureDoneResult> {
    const investment = await em.findOne(InvestmentEntity, {
      where: { id: signature.investmentId! },
    });
    if (!investment) {
      this.logger.warn(
        `Investment ${signature.investmentId} not found for signature ${signature.id}`,
      );
      return { branch: 'noop' };
    }
    if (investment.statut !== InvestmentStatus.INITIE) {
      this.logger.log(
        `Investment ${investment.id} already processed (${investment.statut})`,
      );
      return { branch: 'noop' };
    }

    const project = await em.findOne(ProjectEntity, {
      where: { id: investment.projetId },
    });
    const montant = Number(investment.montant);
    // Frais configurables : AUCUN frais d'entrée à la souscription — le
    // wallet est débité exactement du montant investi. (L'ancien frais
    // d'entrée 2 % Phase 9 est supprimé ; la plateforme se rémunère sur les
    // distributions, la sortie et le marché secondaire.)

    const wallet = await em.findOne(WalletEntity, {
      where: {
        proprietaireUserId: investment.utilisateurId,
        type: WalletType.INVESTISSEUR,
      },
    });
    if (!wallet)
      throw new Error(
        `Wallet introuvable pour user ${investment.utilisateurId}`,
      );
    if (Number(wallet.solde) < montant) {
      throw new Error(
        `Solde insuffisant pour souscription : ${wallet.solde} < ${montant}`,
      );
    }

    // Confirmer l'investissement
    investment.statut = InvestmentStatus.CONFIRME;
    investment.signatureId = signature.id;
    await em.save(InvestmentEntity, investment);

    // Débiter wallet (montant investi, sans frais)
    wallet.solde = Number(wallet.solde) - montant;
    await em.save(WalletEntity, wallet);

    // Transaction ledger principale (souscription)
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
      const nbFractionsTotal =
        project.nbFractions ??
        Math.floor(Number(project.capitalCible) / prixFraction);
      const totalVendues = await em
        .createQueryBuilder(InvestmentEntity, 'inv')
        .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
        .where('inv.projetId = :projetId', { projetId: investment.projetId })
        .andWhere('inv.statut NOT IN (:...excluded)', {
          excluded: [
            InvestmentStatus.RETRACTE,
            InvestmentStatus.ANNULE,
            InvestmentStatus.INITIE,
          ],
        })
        .getRawOne()
        .then((r) => Number(r?.total ?? 0));

      if (totalVendues >= nbFractionsTotal) {
        await em.update(
          ProjectEntity,
          { id: investment.projetId },
          { statut: ProjectStatus.FINANCE },
        );
      }
    }

    return { branch: 'investment', investment, project, montant };
  }

  // ── Souscription initiale : effets de bord (PDF signé + notifications) ───────

  private async finalizeInvestmentSideEffects(
    signature: SignatureEntity,
    investment: InvestmentEntity,
    project: ProjectEntity | null,
    montant: number,
  ): Promise<void> {
    // Replace unsigned PDF with the signed version from YouSign
    try {
      const signedPdf = await this.youSignService.downloadSignedDocument(
        signature.youSignRequestId,
      );
      const filename = `contrat_signe_${investment.id.slice(0, 8)}_${investment.utilisateurId}_${Date.now()}.pdf`;
      const { objectName, publicUrl } = await this.cloudStorage.upload(
        signedPdf,
        filename,
        'application/pdf',
        'contrats',
      );
      if (signature.documentId) {
        await this.documentRepo.update(
          { id: signature.documentId },
          {
            filename: objectName,
            path: publicUrl,
            originalName: filename,
            sizeBytes: signedPdf.length,
          },
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Could not store signed PDF for investment ${investment.id}: ${err?.message}`,
      );
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
        message: `User #${investment.utilisateurId} a investi ${formatEur(montant)} dans "${project?.titre ?? 'projet'}".`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER, UserRole.COMPLIANCE],
        metadata: {
          investissementId: investment.id,
          projetId: investment.projetId,
          montant,
          userId: investment.utilisateurId,
        },
      })
      .catch(() => {});

    this.logger.log(
      `Investment signature done: investmentId=${investment.id} userId=${investment.utilisateurId}`,
    );
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
        montantTotal:
          (i === dureeMois ? montant : 0) +
          Math.round(montant * tauxMensuel * 100) / 100,
        statut: EcheanceStatus.A_VENIR,
        payeLe: null,
      });
    }
    return echeances;
  }

  // ── Signature expirée → libérer l'ordre ─────────────────────────────────────

  private async handleSignatureExpired(
    youSignRequestId: string,
  ): Promise<void> {
    const signature = await this.signatureRepo.findOne({
      where: { youSignRequestId },
    });
    if (!signature) return;

    const demande = SignatureOrmMapper.toDomain(signature);
    if (!demande.estEnAttente) return; // livraison rejouée : rien à faire
    demande.expirer();
    await this.signatureRepo.save(
      SignatureOrmMapper.appliquerSur(signature, demande),
    );

    this.notificationService
      .push({
        utilisateurId: signature.userId,
        type: NotificationType.MARCHE_SECONDAIRE,
        titre: 'Signature expirée',
        message:
          "Votre contrat de rachat a expiré (48h dépassées). L'ordre est toujours disponible si vous souhaitez réessayer.",
        metadata: { ordreId: signature.ordreId, signatureId: signature.id },
      })
      .catch(() => {});

    this.logger.log(
      `Signature expired: ${signature.id} ordreId=${signature.ordreId}`,
    );
  }

  /**
   * Acte la signature : c'est l'entité de `documents` qui refuse un second
   * passage, plus un `if` recopié ici. Posé en dernier, dans la transaction de
   * l'exécution — une panne laisse la demande PENDING, donc rejouable.
   */
  private async acterSignature(
    em: EntityManager,
    ligne: SignatureEntity,
  ): Promise<void> {
    const signature = SignatureOrmMapper.toDomain(ligne);
    signature.signer();
    await em.save(
      SignatureEntity,
      SignatureOrmMapper.appliquerSur(ligne, signature),
    );
  }
}
