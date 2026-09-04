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
import type { ProfilRepository } from 'src/profiles/applications/ports/repositories/profil.repository';
import { PROFIL_REPOSITORY } from 'src/profiles/applications/ports/repositories/profil.repository';
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
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';
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
import { AttribuerBonusParrainageService } from 'src/parrainage/applications/attribuer-bonus-parrainage.service';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';
import {
  CategorieInvestisseur,
  SEUIL_AVERTISSEMENT_PLANCHER_EUR,
  calculerSeuilAvertissement,
  evaluationExpiree,
} from 'src/profiles/domains/investor-classification';
import { calculerEcheanceRetractation } from 'src/investments/domains/retractation';
import { AmlMonitorService } from 'src/common/aml/aml-monitor.service';
import { GelDesAvoirsPort } from 'src/common/aml/gel-des-avoirs.port';
import { ConflitsInteretsService } from 'src/projects/applications/conflits-interets.service';

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
    @Inject(PROFIL_REPOSITORY)
    private readonly profilRepository: ProfilRepository,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly cloudStorage: CloudStorageService,
    private readonly notificationService: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly metrics: MetricsPort,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
    private readonly amlMonitor: AmlMonitorService,
    // Les specs construisent ce usecase à la main : tout ajout se fait en
    // QUEUE de constructeur, pour ne décaler aucun argument existant.
    private readonly bonusParrainage: AttribuerBonusParrainageService,
    // Gel des avoirs (L. 562-4 CMF) — port DIP, en dernière position.
    private readonly gelDesAvoirs: GelDesAvoirsPort,
    // Conflits d'intérêts (décision D5) — en queue, comme les précédents.
    private readonly conflitsInterets: ConflitsInteretsService,
  ) {}

  async execute(userId: number, dto: CreateInvestmentDto): Promise<Investment> {
    // ── Gel des avoirs — AVANT toute lecture ou écriture ─────────────────────
    // Un compte gelé ne souscrit pas, y compris via le réinvestissement
    // automatique des loyers qui passe par ce même usecase. Refus 403
    // AVOIRS_GELES, message neutre unique (docs/adr/ADR-gel-des-avoirs.md).
    await this.gelDesAvoirs.assertAvoirsNonGeles(userId);

    if (dto.idempotencyKey) {
      const previous = await this.walletRepository.findTransactionByIdempotencyKey(
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

    // ── Conflits d'intérêts (décision D5) ────────────────────────────────────
    // Le porteur de CE projet n'y souscrit pas — y compris par le
    // réinvestissement automatique des loyers, qui passe par ce même usecase.
    // Le projet est déjà chargé : la garde ne coûte aucune requête.
    await this.conflitsInterets.assertPasPorteurDuProjet(userId, project);

    // ── Catégorie de l'investisseur — règlement (UE) 2020/1503 ────────────────
    // Le défaut protecteur est « non averti » : un profil absent, incomplet ou
    // dont l'évaluation a expiré (art. 21(2), réexamen tous les deux ans) est
    // traité comme non averti, jamais l'inverse.
    const profilPP = await this.profilRepository.findProfilPPByUserId(userId);
    const evaluationValide = !evaluationExpiree(
      profilPP?.evaluationExpireLe ?? null,
      new Date(),
    );
    const isNonAverti =
      profilPP?.categoriePsfp !== CategorieInvestisseur.AVERTI || !evaluationValide;

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
      project.nbFractions ?? Math.floor(Number(project.capitalCible) / prixFraction);

    // Fractions déjà vendues (investissements actifs hors rétractés/annulés)
    const fractionsVendues = await this.investmentRepository.countFractionsVendues(dto.projetId);
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
        'Wallet introuvable. Veuillez alimenter votre compte avant d\'investir.',
      );
    }
    if (Number(wallet.solde) < montant) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${formatEur(Number(wallet.solde))} — Requis : ${formatEur(montant)}`,
      );
    }

    // ── Art. 21(7) — seuil d'avertissement de l'investisseur non averti ───────
    // Ce n'est pas un plafond : au-delà du plus élevé entre 1 000 € et 5 % du
    // patrimoine net, l'investisseur reçoit un avertissement et doit consentir
    // explicitement. Le seuil est celui calculé lors de l'évaluation ; à défaut
    // d'évaluation exploitable, on retombe sur le plancher légal de 1 000 €.
    if (isNonAverti) {
      const patrimoineNet = Number(profilPP?.patrimoineNetCalcule ?? 0);
      const seuil = evaluationValide
        ? Number(profilPP?.seuilAvertissementCalcule ?? SEUIL_AVERTISSEMENT_PLANCHER_EUR)
        : calculerSeuilAvertissement(patrimoineNet);

      if (montant > seuil && !dto.consentementDepassementLimite) {
        this.metrics.incrementCounter(METRIC.INVESTMENT_PSFP_CAP_BLOCKED_TOTAL, {
          reason: 'non_averti_cap_exceeded',
        });
        throw new BadRequestException(
          `Ce montant dépasse le seuil d'avertissement de ${formatEur(seuil)} applicable ` +
          `aux investisseurs non avertis (le plus élevé entre ${formatEur(SEUIL_AVERTISSEMENT_PLANCHER_EUR)} ` +
          `et 5 % de votre patrimoine net de ${formatEur(patrimoineNet)}). ` +
          `Vous pouvez investir davantage, mais vous devez d'abord prendre connaissance de ` +
          `l'avertissement sur les risques et donner un consentement explicite ` +
          `("consentementDepassementLimite": true).`,
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
    // ── Délai de réflexion accordé par BeOwn ──────────────────────────────────
    // Pour un investisseur non averti, l'engagement n'est pas définitif tant
    // que le délai court. L'investissement reste donc en attente et les fonds
    // sont bloqués, pas transférés : ni échéancier, ni bascule du projet en
    // FINANCE. La confirmation est faite par `ConfirmRetractationCronService`
    // une fois le délai expiré.
    //
    // L'échéance est posée par le domaine : aucune arithmétique de date ici,
    // pour que la durée n'ait qu'un seul point de vérité.
    if (isNonAverti) {
      investment.delaiRetractationJusquAu = calculerEcheanceRetractation(
        new Date(),
      );
      investment.statut = InvestmentStatus.EN_DELAI_RETRACTATION;
    } else {
      investment.delaiRetractationJusquAu = null;
      investment.statut = InvestmentStatus.CONFIRME;
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
      //    de la garde updateSolde qui vit hors transaction). Pour un
      //    investisseur non averti, le montant n'est pas dépensé mais BLOQUÉ :
      //    il quitte le solde disponible sans être mis à disposition du
      //    porteur, le temps du délai de réflexion.
      walletRow.solde = Number(walletRow.solde) - montant;
      if (isNonAverti) {
        walletRow.soldeBloque = Number(walletRow.soldeBloque ?? 0) + montant;
      }
      await manager.save(WalletEntity, walletRow);

      // 5 bis. Contrepartie du débit — GRAND LIVRE INTERNE.
      //    Un débit sans crédit détruit de l'argent : chaque euro qui quitte le
      //    wallet investisseur doit arriver quelque part.
      //     • engagement DÉFINITIF → les fonds sont acquis au projet : ils
      //       sont crédités sur son wallet technique, créé à la demande ;
      //     • souscription encore sous DÉLAI DE RÉFLEXION → les fonds ne
      //       quittent pas le wallet de l'investisseur, ils passent seulement
      //       de la poche disponible à la poche bloquée (art. 22 : rien n'est
      //       mis à disposition du porteur tant que la rétractation est
      //       ouverte). Le transfert vers le projet a lieu à l'expiration du
      //       délai, dans ConfirmRetractationCronService.
      //    Dans les deux cas la somme des fonds détenus est conservée.
      let walletProjet: WalletEntity | null = null;
      if (!isNonAverti) {
        walletProjet = await this.projectWalletResolver.executeInTransaction(
          manager,
          dto.projetId,
          { devise: walletRow.devise },
        );
        walletProjet.solde = Number(walletProjet.solde) + montant;
        await manager.save(WalletEntity, walletProjet);
      }

      // 6. Écriture de la transaction ledger (clé d'idempotence conservée).
      //    `walletDestination` n'est JAMAIS nul : une souscription est créditée
      //    au wallet du projet, un blocage d'escrow reste sur le wallet de
      //    l'investisseur (mouvement interne, source = destination).
      const tx = new Transaction();
      tx.walletSource = wallet.id;
      tx.walletDestination = walletProjet ? walletProjet.id : wallet.id;
      tx.type = isNonAverti
        ? TransactionType.ESCROW_LOCK
        : TransactionType.SOUSCRIPTION;
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

      // 7. Génération + persistance des échéances — uniquement pour un
      //    engagement définitif. Un investissement encore sous délai de
      //    réflexion n'a pas d'échéancier : il serait à annuler en cas de
      //    rétractation. C'est `ConfirmRetractationCronService` qui le génère
      //    à l'expiration du délai.
      if (!isNonAverti) {
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
      }

      // 8. Auto-transition vers FINANCE si toutes les fractions sont vendues —
      //    sûr car on détient le verrou sur la ligne projet. La bascule est
      //    refusée tant qu'un investissement reste sous délai de réflexion :
      //    le financement n'est pas acquis si une rétractation peut encore
      //    libérer des fractions.
      if (fractionsVenduesLocked + dto.nbFractions >= nbFractionsTotal) {
        const enAttente = await manager.count(InvestmentEntity, {
          where: {
            projetId: dto.projetId,
            statut: InvestmentStatus.EN_DELAI_RETRACTATION,
          },
        });
        if (enAttente === 0) {
          projectRow.statut = ProjectStatus.FINANCE;
          await manager.save(ProjectEntity, projectRow);
        }
      }

      return savedDomain;
    });

    this.metrics.incrementCounter(METRIC.INVESTMENT_CREATED_TOTAL, { flow: 'direct' });
    this.metrics.observeHistogram(METRIC.INVESTMENT_AMOUNT_EUR, montant, { flow: 'direct' });

    // ── Vigilance LCB-FT (art. L.561-10 CMF) ─────────────────────────────────
    // Après commit et SANS attendre : une alerte est une mesure de vigilance,
    // pas un gel — elle ne conditionne ni ne retarde une souscription déjà
    // enregistrée. Le service évalue lui-même le cumul du mois glissant.
    this.amlMonitor
      .check({
        userId,
        amount: montant,
        context: 'souscription',
        reference: saved.id,
      })
      .catch(() => {});

    // ── Generate & upload bulletin de souscription ────────────────────────────
    this.generateAndStoreBulletin(saved, project, userId).catch((err) =>
      this.logger.error(`Bulletin generation failed for investment ${saved.id}: ${err?.message}`),
    );

    // Notify via facade (handles both user + admin)
    const user = await this.userRepository.findById(userId);
    if (user) {
      this.notificationEvents.investmentCreated(saved, project, user);
    }

    // Parrainage : un investisseur AVERTI est confirmé immédiatement — son
    // premier investissement est définitif dès maintenant. Le non-averti,
    // lui, sera traité par ConfirmRetractationCronService à la fin du délai.
    // Best-effort APRÈS commit : le service n'échoue jamais chez l'appelant.
    if (saved.statut === InvestmentStatus.CONFIRME) {
      await this.bonusParrainage.surInvestissementDefinitif({
        id: saved.id,
        utilisateurId: userId,
        montant: Number(saved.montant),
      });
    }

    return saved;
  }

  private async generateAndStoreBulletin(
    investment: Investment,
    project: { titre: string; ville: string | null; pays: string; triCible: number | null; dureeMois: number },
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
    await this.investmentRepository.updateBulletinDocId(investment.id, savedDoc.id);

    this.logger.log(`Bulletin généré: investmentId=${investment.id} docId=${savedDoc.id} url=${publicUrl}`);
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
