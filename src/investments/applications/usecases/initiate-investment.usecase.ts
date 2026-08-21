import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { DocumentType, DocumentRelatedTo } from 'src/documents/domains/enums/document-type.enum';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { formatEur } from 'src/shared/money/format-eur';
import { ContractGeneratorService } from './contract-generator.service';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { Investment } from 'src/investments/domains/investment';

@Injectable()
export class InitiateInvestmentUseCase {
  private readonly logger = new Logger(InitiateInvestmentUseCase.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentRepo: Repository<DocumentEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRepo: Repository<SignatureEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserEmailEntity)
    private readonly userEmailRepo: Repository<UserEmailEntity>,
    private readonly cloudStorage: CloudStorageService,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly youSignService: YouSignService,
  ) {}

  async execute(
    userId: number,
    projetId: string,
    nbFractions: number,
  ): Promise<{ signingUrl: string; signatureId: string }> {
    // ── Validation du projet ──────────────────────────────────────────────────
    const project = await this.projectRepo.findOne({ where: { id: projetId } });
    if (!project) throw new NotFoundException('Projet introuvable');

    if (project.statut !== ProjectStatus.EN_COLLECTE) {
      throw new BadRequestException(
        project.statut === ProjectStatus.FINANCE
          ? 'Ce projet est déjà entièrement financé.'
          : "L'investissement n'est possible que sur un projet en cours de collecte.",
      );
    }

    const prixFraction = Number(project.ticketMinimum);
    const nbFractionsTotal =
      project.nbFractions ?? Math.floor(Number(project.capitalCible) / prixFraction);

    const fractionsVendues = await this.investRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
      .where('inv.projetId = :projetId', { projetId })
      .andWhere('inv.statut NOT IN (:...excluded)', {
        excluded: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getRawOne()
      .then((r) => Number(r?.total ?? 0));

    const fractionsDisponibles = nbFractionsTotal - fractionsVendues;

    if (fractionsDisponibles <= 0) {
      if (project.statut === ProjectStatus.EN_COLLECTE) {
        await this.projectRepo.update(projetId, { statut: ProjectStatus.FINANCE });
      }
      throw new BadRequestException(
        'Il ne reste plus de fractions disponibles sur ce projet.',
      );
    }
    if (nbFractions < 1 || nbFractions > fractionsDisponibles) {
      throw new BadRequestException(
        `Quantité invalide. Fractions disponibles : ${fractionsDisponibles}`,
      );
    }

    const montantTotal = nbFractions * prixFraction;

    if (project.ticketMaximum && montantTotal > Number(project.ticketMaximum)) {
      throw new BadRequestException(
        `Votre investissement dépasse le ticket maximum de ${project.ticketMaximum}.`,
      );
    }

    // ── Vérification solde wallet (sans débiter) ───────────────────────────────
    const wallets = await this.walletRepo.find({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR, devise: 'EUR' },
    });
    if (wallets.length === 0) {
      throw new BadRequestException(
        "Wallet introuvable. Alimentez votre compte avant d'investir.",
      );
    }
    const wallet = wallets.reduce((best, w) => (Number(w.solde) > Number(best.solde) ? w : best));
    if (Number(wallet.solde) < montantTotal) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${formatEur(Number(wallet.solde))} — Requis : ${formatEur(montantTotal)}`,
      );
    }

    // ── Infos investisseur pour le PDF ─────────────────────────────────────────
    const user = await this.userRepo.findOne({ where: { userId } });
    const userEmail = await this.userEmailRepo.findOne({ where: { userId } });

    // ── Création de l'investissement (statut INITIE) ───────────────────────────
    const investment = this.investRepo.create({
      projetId,
      utilisateurId: userId,
      montant: montantTotal,
      instrument: project.instrument,
      nbTitres: nbFractions,
      valeurTitre: prixFraction,
      statut: InvestmentStatus.INITIE,
      delaiRetractationJusquAu: null,
      bulletinDocId: null,
      signatureId: null,
      reservationId: null,
    });
    const savedInvestment = await this.investRepo.save(investment);

    // ── Génération du PDF contrat de souscription ──────────────────────────────
    const investmentDomain = Object.assign(new Investment(), savedInvestment);
    const pdfBuffer = await this.contractGenerator.generateContratSouscription({
      investment: investmentDomain,
      investorFirstname: user?.firstname ?? 'Investisseur',
      investorLastname: user?.lastname ?? '',
      investorEmail: userEmail?.email ?? '',
      projectTitle: project.titre,
      projectVille: project.ville ?? '',
      projectPays: project.pays,
      triCible: Number(project.triCible ?? 0),
      dureeMois: Number(project.dureeMois),
    });

    // ── Upload GCS ─────────────────────────────────────────────────────────────
    const filename = `contrat_souscription_${savedInvestment.id.slice(0, 8)}_${userId}_${Date.now()}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdfBuffer,
      filename,
      'application/pdf',
      'contrats',
    );

    // ── Création du Document ───────────────────────────────────────────────────
    const docEntity = this.documentRepo.create({
      type: DocumentType.CONTRAT_SOUSCRIPTION,
      relatedTo: DocumentRelatedTo.INVESTMENT,
      userId,
      projectId: projetId,
      investmentId: savedInvestment.id,
      originalName: filename,
      filename: objectName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBuffer.length,
      path: publicUrl,
      isPublic: false,
      uploadedBy: userId,
      ordre: null,
      estPrincipale: false,
    });
    const savedDoc = await this.documentRepo.save(docEntity);

    // ── Envoi à YouSign + lien de signature embarqué ───────────────────────────
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const successRedirectUrl = `${frontendUrl}/dashboard/invest/success?investmentId=${savedInvestment.id}`;
    const { requestId, signerId, signingUrl } =
      await this.youSignService.createEmbeddedSignatureRequest({
        documentBuffer: pdfBuffer,
        documentName: filename,
        signerEmail: userEmail?.email ?? '',
        signerFirstname: user?.firstname ?? 'Investisseur',
        signerLastname: user?.lastname ?? '',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        successRedirectUrl,
        errorRedirectUrl: successRedirectUrl,
      });

    // ── Création de l'enregistrement Signature ─────────────────────────────────
    const sigEntity = this.signatureRepo.create({
      youSignRequestId: requestId,
      youSignSignerId: signerId,
      youSignSigningUrl: signingUrl,
      documentId: savedDoc.id,
      investmentId: savedInvestment.id,
      ordreId: null,
      nbFractions,
      userId,
      statut: SignatureStatus.PENDING,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      signedAt: null,
    });
    const savedSig = await this.signatureRepo.save(sigEntity);

    // Lier la signature à l'investissement
    await this.investRepo.update(savedInvestment.id, { signatureId: savedSig.id });

    // Auto-transition FINANCE si toutes les fractions sont réservées
    const totalClaims = await this.investRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.nbTitres), 0)', 'total')
      .where('inv.projetId = :projetId', { projetId })
      .andWhere('inv.statut NOT IN (:...excluded)', {
        excluded: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getRawOne()
      .then((r) => Number(r?.total ?? 0));

    if (totalClaims >= nbFractionsTotal) {
      await this.projectRepo.update(projetId, { statut: ProjectStatus.FINANCE });
      this.logger.log(`Project ${projetId} → FINANCE (${totalClaims}/${nbFractionsTotal} fractions réservées)`);
    }

    this.logger.log(
      `InitiateInvestment: investmentId=${savedInvestment.id} userId=${userId} signatureId=${savedSig.id}`,
    );

    return { signingUrl, signatureId: savedSig.id };
  }
}
