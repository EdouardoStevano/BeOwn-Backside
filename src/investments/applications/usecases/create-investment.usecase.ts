import {
  BadRequestException,
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
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/profiles/domains/ports/profil-pp.repository';
import { PLANCHER_PLAFOND_NON_AVERTI } from 'src/profiles/domains/value-objects/evaluation-investisseur.vo';
import { Investment } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import {
  EcheanceStatus,
  InvestmentStatus,
  RemboursementMode,
} from 'src/investments/domains/enums/investment-status.enum';
import { CreateInvestmentDto } from 'src/investments/presenters/dto/investment.dto';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { Transaction } from 'src/wallets/domains/transaction';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';
import { ContractGeneratorService } from './contract-generator.service';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { formatEur } from 'src/shared/money/format-eur';
import { Document } from 'src/documents/domains/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
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
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(userId: number, dto: CreateInvestmentDto): Promise<Investment> {
    if (dto.idempotencyKey) {
      const previous =
        await this.walletRepository.findTransactionByIdempotencyKey(
          `invest-request:${userId}:${dto.idempotencyKey}`,
        );
      if (previous?.investissementId) {
        const existing = await this.investmentRepository.findInvestmentById(
          previous.investissementId,
        );
        if (existing) return existing;
      }
    }
    const project = await this.projectRepository.findProjectById(dto.projetId);
    if (!project) throw new NotFoundException('Projet introuvable.');

    // Get investor profile to check PSFP category
    const profilPP = await this.profilPPRepository.findByUserId(userId);
    const isNonAverti = profilPP?.estNonAverti() ?? false;

    if (project.statut !== ProjectStatus.EN_COLLECTE) {
      throw new BadRequestException(
        project.statut === ProjectStatus.FINANCE
          ? 'Ce projet est déjà entièrement financé.'
          : "L'investissement n'est possible que sur un projet en cours de collecte.",
      );
    }

    // Prix par fraction = ticketMinimum du projet
    const prixFraction = Number(project.ticketMinimum);

    // Nombre total de fractions du projet (calculé si non renseigné explicitement)
    const nbFractionsTotal =
      project.nbFractions ??
      Math.floor(Number(project.capitalCible) / prixFraction);

    // Fractions déjà vendues (investissements actifs hors rétractés/annulés)
    const fractionsVendues =
      await this.investmentRepository.countFractionsVendues(dto.projetId);
    const fractionsDisponibles = nbFractionsTotal - fractionsVendues;

    if (fractionsDisponibles <= 0) {
      throw new BadRequestException(
        'Il ne reste plus de fractions disponibles sur ce projet.',
      );
    }

    if (dto.nbFractions > fractionsDisponibles) {
      throw new BadRequestException(
        `Seulement ${fractionsDisponibles} fraction(s) disponible(s) sur ce projet.`,
      );
    }

    const montant = dto.nbFractions * prixFraction;

    if (project.ticketMaximum && montant > Number(project.ticketMaximum)) {
      throw new BadRequestException(
        `Votre investissement dépasse le ticket maximum de ${project.ticketMaximum}.`,
      );
    }

    // ── Wallet check & deduction ──────────────────────────────────────────────
    const wallet = await this.walletRepository.findWalletByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) {
      throw new BadRequestException(
        "Wallet introuvable. Veuillez alimenter votre compte avant d'investir.",
      );
    }
    if (Number(wallet.solde) < montant) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${formatEur(Number(wallet.solde))} — Requis : ${formatEur(montant)}`,
      );
    }

    // ── PSFP limit check for non-averti investors ─────────────────────────────
    // Le plafond se calcule depuis le profil : il ne dépend que de la catégorie
    // et du patrimoine déclaré, pas de la souscription en cours. `null` = le
    // statut de l'investisseur ne recommande aucun plafond.
    const recommendedCap = profilPP?.plafondConseille() ?? null;
    if (recommendedCap !== null) {
      const patrimoine = Number(profilPP?.patrimoineDeclare ?? 0);
      if (montant > recommendedCap && !dto.consentementDepassementLimite) {
        throw new BadRequestException(
          `Votre statut "non averti" recommande de ne pas dépasser ${formatEur(recommendedCap)} par investissement ` +
            `(max entre ${formatEur(PLANCHER_PLAFOND_NON_AVERTI)} et 5% de votre patrimoine déclaré de ${formatEur(patrimoine)}). ` +
            `Pour passer outre, cochez la case de consentement explicite "consentementDepassementLimite": true.`,
        );
      }
    }

    const investment = new Investment();
    investment.projetId = dto.projetId;
    investment.utilisateurId = userId;
    investment.montant = montant;
    investment.instrument = project.instrument;
    investment.nbTitres = dto.nbFractions;
    investment.valeurTitre = prixFraction;
    investment.statut = InvestmentStatus.CONFIRME;
    // PSFP: set 4-day retraction delay for non-averti investors
    if (isNonAverti) {
      const retractationDate = new Date();
      retractationDate.setDate(retractationDate.getDate() + 4);
      investment.delaiRetractationJusquAu = retractationDate;
    } else {
      investment.delaiRetractationJusquAu = null;
    }
    investment.bulletinDocId = null;
    investment.signatureId = null;
    investment.reservationId = dto.reservationId ?? null;

    // ── Section critique atomique (anti-survente + débit garanti) ─────────────
    // Tout ce qui touche à l'allocation des fractions et au débit du wallet vit
    // dans UNE transaction avec verrous pessimistes : la ligne projet sérialise
    // les insertions concurrentes (recompte fiable), la ligne wallet garantit un
    // solde relu sous verrou avant débit. Le moindre throw annule l'ensemble
    // (investissement, débit, transaction ledger, échéances, passage FINANCE).
    const saved = await this.dataSource.transaction(async (manager) => {
      // 1. Verrou sur la ligne projet — sérialise l'allocation de fractions.
      const projectRow = await manager.findOne(ProjectEntity, {
        where: { id: dto.projetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!projectRow) throw new NotFoundException('Projet introuvable.');
      if (projectRow.statut !== ProjectStatus.EN_COLLECTE) {
        throw new BadRequestException(
          projectRow.statut === ProjectStatus.FINANCE
            ? 'Ce projet est déjà entièrement financé.'
            : "L'investissement n'est possible que sur un projet en cours de collecte.",
        );
      }

      // 2. Recompte des fractions vendues SOUS VERROU (même filtre que
      //    countFractionsVendues : SUM(nbTitres) hors RETRACTE/ANNULE). Les
      //    insertions concurrentes sur ce projet sont bloquées par le verrou
      //    ci-dessus, donc le total est exact.
      const raw = await manager
        .createQueryBuilder(InvestmentEntity, 'i')
        .select('COALESCE(SUM(i.nbTitres), 0)', 'total')
        .where('i.projetId = :projetId', { projetId: dto.projetId })
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
      if (dto.nbFractions > disponiblesLocked) {
        throw new BadRequestException(
          `Seulement ${disponiblesLocked} fraction(s) disponible(s) sur ce projet.`,
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
      if (Number(walletRow.solde) < montant) {
        throw new BadRequestException(
          `Solde insuffisant. Disponible : ${formatEur(Number(walletRow.solde))} — Requis : ${formatEur(montant)}`,
        );
      }

      // 4. Persistance de l'investissement.
      const savedEntity = await manager.save(
        InvestmentEntity,
        InvestmentMapper.toEntity(investment),
      );
      const savedDomain = InvestmentMapper.toDomain(savedEntity);

      // 5. Débit du wallet SOUS VERROU (source de vérité du débit, indépendant
      //    de la garde updateSolde qui vit hors transaction).
      walletRow.solde = Number(walletRow.solde) - montant;
      await manager.save(WalletEntity, walletRow);

      // 6. Écriture de la transaction ledger (clé d'idempotence conservée).
      const tx = new Transaction();
      tx.walletSource = wallet.id;
      tx.walletDestination = null;
      tx.type = TransactionType.SOUSCRIPTION;
      tx.montant = montant;
      tx.devise = wallet.devise;
      tx.statut = TransactionStatus.REUSSI;
      tx.fournisseur = TransactionFournisseur.INTERNE;
      tx.referenceExterne = null;
      tx.investissementId = savedDomain.id;
      tx.echeanceId = null;
      tx.reservationId = null;
      tx.projetId = dto.projetId;
      tx.idempotencyKey = dto.idempotencyKey
        ? `invest-request:${userId}:${dto.idempotencyKey}`
        : `invest:${userId}:${savedDomain.id}`;
      tx.fraisPsp = 0;
      tx.fraisPlateforme = 0;
      tx.metadata = null;
      tx.motifEchec = null;
      await manager.save(TransactionEntity, WalletMapper.txToEntity(tx));

      // 7. Génération + persistance des échéances.
      const echeances = this.generateEcheances(
        savedDomain.id,
        montant,
        project.triCible ?? 0,
        project.dureeMois,
        dto.modeRemboursement ?? RemboursementMode.IN_FINE,
      );
      await manager.save(
        EcheanceEntity,
        echeances.map(InvestmentMapper.echeanceToEntity),
      );

      // 8. Auto-transition vers FINANCE si toutes les fractions sont vendues —
      //    sûr car on détient le verrou sur la ligne projet.
      if (fractionsVenduesLocked + dto.nbFractions >= nbFractionsTotal) {
        projectRow.statut = ProjectStatus.FINANCE;
        await manager.save(ProjectEntity, projectRow);
      }

      return savedDomain;
    });

    // ── Generate & upload bulletin de souscription ────────────────────────────
    this.generateAndStoreBulletin(saved, project, userId).catch((err) =>
      this.logger.error(
        `Bulletin generation failed for investment ${saved.id}: ${err?.message}`,
      ),
    );

    // Notify via facade (handles both user + admin)
    const user = await this.userRepository.findById(userId);
    if (user) {
      this.notificationEvents.investmentCreated(saved, project, user);
    }

    return saved;
  }

  private async generateAndStoreBulletin(
    investment: Investment,
    project: {
      titre: string;
      ville: string | null;
      pays: string;
      triCible: number | null;
      dureeMois: number;
    },
    userId: number,
  ): Promise<void> {
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
    await this.investmentRepository.updateBulletinDocId(
      investment.id,
      savedDoc.id,
    );

    this.logger.log(
      `Bulletin généré: investmentId=${investment.id} docId=${savedDoc.id} url=${publicUrl}`,
    );
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
