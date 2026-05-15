import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructure/persistences/entities/user-email.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { DocumentType, DocumentRelatedTo } from 'src/documents/domains/enums/document-type.enum';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { CloudStorageService } from 'src/common/cloud-storage/cloud-storage.service';
import { ContractGeneratorService } from 'src/investments/applications/usecases/contract-generator.service';
import { YouSignService } from 'src/common/yousign/yousign.service';

@Injectable()
export class InitiateBuyUseCase {
  private readonly logger = new Logger(InitiateBuyUseCase.name);

  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
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
    ordreId: string,
    userId: number,
    nbFractions: number,
  ): Promise<{ signingUrl: string; signatureId: string }> {
    // ── Validation de l'ordre ──────────────────────────────────────────────────
    const ordre = await this.ordreRepo.findOne({
      where: { id: ordreId },
      relations: ['investissement', 'investissement.projet'],
    });
    if (!ordre) throw new NotFoundException('Ordre introuvable');
    if (ordre.statut !== OrdreMarcheStatus.EN_CARNET) {
      throw new BadRequestException('Cet ordre n\'est plus disponible');
    }
    if (ordre.vendeurId === userId) {
      throw new ForbiddenException('Vous ne pouvez pas acheter votre propre ordre');
    }
    if (nbFractions < 1 || nbFractions > ordre.nbFractions) {
      throw new BadRequestException(
        `Quantité invalide : doit être entre 1 et ${ordre.nbFractions}`,
      );
    }

    const totalCost = nbFractions * Number(ordre.prixUnitaire);
    const projetId = ordre.investissement.projetId;

    // ── Vérification solde wallet (sans débiter) ───────────────────────────────
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) {
      throw new BadRequestException(
        "Wallet introuvable. Alimentez votre compte avant d'investir.",
      );
    }
    if (Number(wallet.solde) < totalCost) {
      throw new BadRequestException(
        `Solde insuffisant. Disponible : ${wallet.solde} XOF — Requis : ${totalCost} XOF`,
      );
    }

    // ── Investissement existant sur ce projet ? (cas A vs cas B) ─────────────
    const existingInvestment = await this.investRepo.findOne({
      where: {
        utilisateurId: userId,
        projetId,
        statut: InvestmentStatus.CONFIRME,
      },
    });

    // ── Infos acheteur pour le PDF ─────────────────────────────────────────────
    const user = await this.userRepo.findOne({ where: { userId } });
    const userEmail = await this.userEmailRepo.findOne({ where: { userId } });
    const projet = ordre.investissement?.projet;

    // ── Génération du PDF contrat de rachat ────────────────────────────────────
    const pdfBuffer = await this.contractGenerator.generateContratRachat({
      ordreId,
      acheteurFirstname: user?.firstname ?? 'Investisseur',
      acheteurLastname: user?.lastname ?? '',
      acheteurEmail: userEmail?.email ?? '',
      vendeurId: ordre.vendeurId,
      projectTitle: projet?.titre ?? 'Projet',
      projectVille: projet?.ville ?? '',
      projectPays: (projet as any)?.pays ?? '',
      nbFractions,
      prixUnitaire: Number(ordre.prixUnitaire),
      montantTotal: totalCost,
      triCible: Number((projet as any)?.triCible ?? 0),
      dureeMois: Number((projet as any)?.dureeMois ?? 12),
    });

    // ── Upload GCS ─────────────────────────────────────────────────────────────
    const filename = `contrat_rachat_${ordreId.slice(0, 8)}_${userId}_${Date.now()}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdfBuffer,
      filename,
      'application/pdf',
      'contrats',
    );

    // ── Création du Document ───────────────────────────────────────────────────
    const docEntity = this.documentRepo.create({
      type: DocumentType.CONTRAT_RACHAT,
      relatedTo: DocumentRelatedTo.INVESTMENT,
      userId,
      projectId: projetId,
      investmentId: existingInvestment?.id ?? null,
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
    const successRedirectUrl = `${frontendUrl}/dashboard/invest/success?ordreId=${ordreId}`;
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
      investmentId: existingInvestment?.id ?? null,
      ordreId,
      nbFractions,
      userId,
      statut: SignatureStatus.PENDING,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      signedAt: null,
    });
    const savedSig = await this.signatureRepo.save(sigEntity);

    this.logger.log(
      `InitiateBuy: ordreId=${ordreId} userId=${userId} signatureId=${savedSig.id} youSignRequestId=${requestId}`,
    );

    return { signingUrl, signatureId: savedSig.id };
  }
}
