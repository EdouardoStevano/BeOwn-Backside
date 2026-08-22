import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { SignatureEntity } from 'src/documents/infrastructure/persistence/entities/signature.entity';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import type { ProjectRepository } from 'src/catalog/domain/repositories/project.repository';
import { PROJECT_REPOSITORY } from 'src/catalog/domain/repositories/project.repository';
import type { InvestmentRepository } from '../../domain/repositories/investment.repository';
import { INVESTMENT_REPOSITORY } from '../../domain/repositories/investment.repository';
import type { WalletRepository } from 'src/treasury/domain/repositories/wallet.repository';
import { WALLET_REPOSITORY } from 'src/treasury/domain/repositories/wallet.repository';
import type { DocumentRepository } from 'src/documents/domain/repositories/document.repository';
import { DOCUMENT_REPOSITORY } from 'src/documents/domain/repositories/document.repository';
import type { UserRepository } from 'src/iam/domain/repositories/user.repository';
import { USER_REPOSITORY } from 'src/iam/domain/repositories/user.repository';
import { CollecteCapacity } from 'src/subscription/domain/aggregates/collecte-capacity';
import { InvestmentFactory } from 'src/subscription/domain/factories/investment.factory';
import {
  ProjetIntrouvableError,
  SoldeInsuffisantError,
  WalletIntrouvableError,
} from 'src/subscription/domain/errors/subscription.errors';
import { SignableDocument } from 'src/documents/domain/aggregates/signable-document';
import {
  DocumentType,
  DocumentRelatedTo,
} from 'src/documents/domain/enums/document-type.enum';
import { Signature } from 'src/documents/domain/entities/signature';
import { SignatureOrmMapper } from 'src/documents/infrastructure/persistence/mappers/signature.orm-mapper';
import { WalletType } from 'src/treasury/domain/enums/wallet.enum';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { ContractGeneratorService } from '../services/contract-generator.service';
import { YouSignService } from 'src/common/yousign/yousign.service';
import { ProjetSouscriptibleTranslator } from '../acl/projet-souscriptible.translator';

/** Durée de validité d'une demande de signature envoyée au prestataire. */
const VALIDITE_DEMANDE_SIGNATURE_MS = 48 * 60 * 60 * 1000;

/**
 * **Initier une souscription par signature** — l'investissement est réservé
 * (`INITIE`, sans débit) et l'investisseur reçoit un lien de signature
 * électronique pour son bulletin. Le débit et la confirmation suivent le
 * retour du prestataire.
 *
 * Le use case orchestre, il ne décide pas (§14) : les portes de la
 * souscription vivent dans {@link InvestmentFactory.initier} et l'anti-survente
 * dans {@link CollecteCapacity}. Ce use case portait sa **propre copie** des
 * deux règles — un troisième `SUM(nbTitres)` écrit à la main, un troisième
 * calcul de `nbFractionsTotal`, un troisième contrôle de ticket plafond — et
 * ses messages avaient déjà divergé de ceux des deux autres.
 *
 * Il lit désormais ses dépendances par les ports des contextes amont
 * (`PROJECT_REPOSITORY`, `WALLET_REPOSITORY`, `USER_REPOSITORY`,
 * `DOCUMENT_REPOSITORY`) au lieu d'injecter six `Repository<Entity>` TypeORM
 * appartenant à cinq contextes différents (§13, §33).
 *
 * > Écarts restants, assumés : l'écriture du passage `FINANCE` sur
 * > `ProjectEntity` et la création de `SignatureEntity` touchent encore
 * > directement la base d'autres contextes, faute de port en écriture côté
 * > `catalog` et `documents`. Contrairement à `CreateInvestmentUseCase`, ce
 * > parcours ne pose **aucun verrou** : deux initiations concurrentes peuvent
 * > se réserver les mêmes dernières fractions. C'est le comportement d'origine,
 * > inchangé — le durcir demande la même section critique que la souscription
 * > directe, et mérite son propre correctif.
 */
@Injectable()
export class InitiateInvestmentUseCase {
  private readonly logger = new Logger(InitiateInvestmentUseCase.name);

  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(INVESTMENT_REPOSITORY)
    private readonly investmentRepository: InvestmentRepository,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @InjectRepository(ProjectEntity)
    private readonly projectRows: Repository<ProjectEntity>,
    @InjectRepository(SignatureEntity)
    private readonly signatureRows: Repository<SignatureEntity>,
    private readonly cloudStorage: CloudStorageService,
    private readonly contractGenerator: ContractGeneratorService,
    private readonly youSignService: YouSignService,
  ) {}

  async execute(
    userId: number,
    projetId: string,
    nbFractions: number,
  ): Promise<{ signingUrl: string; signatureId: string }> {
    const projetCatalogue =
      await this.projectRepository.findProjectById(projetId);
    if (!projetCatalogue) throw new ProjetIntrouvableError(projetId);
    const projet = ProjetSouscriptibleTranslator.traduire(projetCatalogue);

    const capacite = CollecteCapacity.duProjet(
      projet,
      await this.investmentRepository.countFractionsVendues(projetId),
    );

    // La collecte est complète : on l'acte sur le projet avant de refuser —
    // c'est le rattrapage de statut que faisait déjà l'ancienne version.
    if (capacite.estIntegralementSouscrite && projet.enCollecte) {
      await this.projectRows.update(projetId, {
        statut: ProjectStatus.FINANCE,
      });
    }

    const naissant = InvestmentFactory.initier(
      { projet, utilisateurId: userId, nbFractions },
      capacite,
    );

    // Le solde est vérifié sans être débité : le débit suit la signature.
    const wallet = await this.walletRepository.findByUser(
      userId,
      WalletType.INVESTISSEUR,
    );
    if (!wallet) throw new WalletIntrouvableError();
    if (Number(wallet.solde) < naissant.montant) {
      throw new SoldeInsuffisantError(Number(wallet.solde), naissant.montant);
    }

    const investment = await this.investmentRepository.creer(naissant);

    // ── Bulletin, signature électronique, traçabilité ─────────────────────────
    const user = await this.userRepository.findById(userId);
    const pdfBuffer = await this.contractGenerator.generateContratSouscription({
      investment,
      investorFirstname: user?.firstname ?? 'Investisseur',
      investorLastname: user?.lastname ?? '',
      investorEmail: user?.email ?? '',
      projectTitle: projetCatalogue.titre,
      projectVille: projetCatalogue.ville ?? '',
      projectPays: projetCatalogue.pays,
      triCible: projet.triCible,
      dureeMois: projet.dureeMois,
    });

    const filename = `contrat_souscription_${investment.id.slice(0, 8)}_${userId}_${Date.now()}.pdf`;
    const { objectName, publicUrl } = await this.cloudStorage.upload(
      pdfBuffer,
      filename,
      'application/pdf',
      'contrats',
    );

    const savedDoc = await this.documentRepository.creer(
      SignableDocument.televerser({
        type: DocumentType.CONTRAT_SOUSCRIPTION,
        relatedTo: DocumentRelatedTo.INVESTMENT,
        userId,
        projectId: projetId,
        investmentId: investment.id,
        originalName: filename,
        filename: objectName,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        path: publicUrl,
        isPublic: false,
        uploadedBy: userId,
        ordre: null,
        estPrincipale: false,
      }),
    );

    const expiresAt = new Date(Date.now() + VALIDITE_DEMANDE_SIGNATURE_MS);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const successRedirectUrl = `${frontendUrl}/dashboard/invest/success?investmentId=${investment.id}`;
    const { requestId, signerId, signingUrl } =
      await this.youSignService.createEmbeddedSignatureRequest({
        documentBuffer: pdfBuffer,
        documentName: filename,
        signerEmail: user?.email ?? '',
        signerFirstname: user?.firstname ?? 'Investisseur',
        signerLastname: user?.lastname ?? '',
        expiresAt,
        successRedirectUrl,
        errorRedirectUrl: successRedirectUrl,
      });

    const savedSignature = await this.signatureRows.save(
      SignatureOrmMapper.naissanteToEntity(
        Signature.demander({
          youSignRequestId: requestId,
          youSignSignerId: signerId,
          youSignSigningUrl: signingUrl,
          documentId: savedDoc.id,
          investmentId: investment.id,
          ordreId: null,
          nbFractions,
          userId,
          expiresAt,
        }),
      ),
    );

    investment.rattacherDemandeDeSignature(savedSignature.id);
    await this.investmentRepository.save(investment);

    // Les fractions de cette initiation comptent déjà dans la collecte : si
    // elle vient de la compléter, le projet passe FINANCE.
    if (capacite.estIntegralementSouscrite) {
      await this.projectRows.update(projetId, {
        statut: ProjectStatus.FINANCE,
      });
      this.logger.log(
        `Project ${projetId} → FINANCE (${capacite.fractionsDejaVendues}/${capacite.nbFractionsTotal} fractions réservées)`,
      );
    }

    this.logger.log(
      `InitiateInvestment: investmentId=${investment.id} userId=${userId} signatureId=${savedSignature.id}`,
    );

    return { signingUrl, signatureId: savedSignature.id };
  }
}
