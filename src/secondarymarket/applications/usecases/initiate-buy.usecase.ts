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
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { DocumentType, DocumentRelatedTo } from 'src/documents/domains/enums/document-type.enum';
import { SignatureStatus } from 'src/signatures/domains/enums/signature-status.enum';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { ContractGeneratorService } from 'src/investments/applications/usecases/contract-generator.service';
import { SignatureProvider } from 'src/signatures/applications/ports/signature-provider.port';
import { GelDesAvoirsPort } from 'src/common/aml/gel-des-avoirs.port';
import { formatEur } from 'src/shared/money/format-eur';
import { ConflitsInteretsService } from 'src/projects/applications/conflits-interets.service';

/**
 * Initiation du parcours contractuel d'une cession : génération du contrat de
 * rachat, dépôt du document et ouverture de la signature électronique.
 *
 * **Précondition** : l'annonce est en `ACCEPTE`, c'est-à-dire que le vendeur a
 * déjà donné son accord et que `RepondreInteretUseCase.accepter()` a posé la
 * transition de manière conditionnelle et atomique. Ce use case ne se prononce
 * pas sur l'opportunité de la cession : cette décision appartient au vendeur,
 * et elle est déjà inscrite en base quand on arrive ici.
 *
 * Historiquement ce use case servait l'achat immédiat (`POST orders/:id/execute`)
 * et exigeait donc `EN_CARNET`. Cette route est débranchée en 410 : accepter
 * encore `EN_CARNET` reviendrait à laisser ouverte une porte par laquelle une
 * cession pourrait s'initier SANS l'accord du vendeur, ce que l'article 25
 * exclut. La précondition est donc `ACCEPTE`, et seulement lui.
 */
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
    // Port DIP : YouSign ou repli « acceptation certifiée » selon
    // SIGNATURE_PROVIDER (même position de constructeur que l'ancien service
    // concret — les specs construisent à la main).
    private readonly signatureProvider: SignatureProvider,
    // Gel des avoirs (L. 562-4 CMF) — port DIP, en dernière position.
    private readonly gelDesAvoirs: GelDesAvoirsPort,
    // Conflits d'intérêts (décision D5) — en queue, comme le précédent.
    private readonly conflitsInterets: ConflitsInteretsService,
  ) {}

  async execute(
    ordreId: string,
    userId: number,
    nbFractions: number,
  ): Promise<{ signingUrl: string; signatureId: string }> {
    // ── Gel des avoirs de l'ACHETEUR — avant la formation du contrat ─────────
    // Couvre la fenêtre « intérêt exprimé avant le gel, acceptation vendeur
    // après » : l'acceptation est alors compensée proprement par
    // RepondreInteretUseCase (fonds libérés, annonce restaurée) et l'erreur
    // 403 AVOIRS_GELES remonte. Docs/adr/ADR-gel-des-avoirs.md.
    await this.gelDesAvoirs.assertAvoirsNonGeles(userId);

    // ── Validation de l'ordre ──────────────────────────────────────────────────
    const ordre = await this.ordreRepo.findOne({
      where: { id: ordreId },
      relations: ['investissement', 'investissement.projet'],
    });
    if (!ordre) throw new NotFoundException('Ordre introuvable');
    // Seule l'acceptation du vendeur ouvre le parcours de signature. Une
    // annonce encore en carnet, déjà exécutée, annulée ou expirée n'a rien à
    // faire ici : la refuser explicitement empêche qu'une cession se forme
    // sans accord, et empêche aussi qu'un second contrat soit émis sur une
    // annonce déjà servie.
    if (ordre.statut !== OrdreMarcheStatus.ACCEPTE) {
      throw new BadRequestException(
        "Cette annonce n'est pas au stade de la signature : la cession ne " +
          "s'initie qu'une fois l'accord du vendeur enregistré.",
      );
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

    // ── Conflits d'intérêts (décision D5) ────────────────────────────────────
    // La garde vise l'ACHETEUR : acquérir des parts, c'est souscrire par une
    // autre porte. Le porteur du projet ne peut pas racheter les parts de sa
    // propre société support. Le projet vient de la relation déjà chargée
    // (`relations: ['investissement', 'investissement.projet']`) ; à défaut, on
    // se rabat sur l'identifiant plutôt que de décider sans savoir.
    await this.conflitsInterets.assertPasPorteurDuProjet(
      userId,
      ordre.investissement?.projet ?? projetId,
    );

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
        `Solde insuffisant. Disponible : ${formatEur(Number(wallet.solde))} — Requis : ${formatEur(totalCost)}`,
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

    // ── Ouverture de la demande de signature (provider configuré) ──────────────
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const successRedirectUrl = `${frontendUrl}/dashboard/invest/success?ordreId=${ordreId}`;
    const { requestId, signerId, signingUrl, provider, documentHash } =
      await this.signatureProvider.createEmbeddedSignatureRequest({
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
      provider,
      documentHash,
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
