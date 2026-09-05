import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Redirect,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { Public } from 'src/common/auth/public.decorator';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { Document } from 'src/documents/domains/document';
import {
  DocumentRelatedTo,
  DocumentType,
} from 'src/documents/domains/enums/document-type.enum';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import {
  parseBooleanish,
  SetOrdreDto,
  UploadDocumentDto,
} from '../dto/document.dto';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { estPieceKyc } from 'src/rgpd/domains/retention-policy';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    private readonly cloudStorage: CloudStorageService,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investmentRepo: Repository<InvestmentEntity>,
  ) {}

  /**
   * Premier niveau : le compte peut-il seulement CONSULTER LA LISTE des pièces
   * d'un utilisateur ? Inchangé — c'est l'accès à l'annuaire documentaire, pas
   * aux pièces sensibles, que le second niveau filtre ensuite pièce par pièce.
   */
  private canListUserDocuments(
    user: ActiveUser,
    ownerUserId: number | null,
  ): boolean {
    return (
      ownerUserId === user.userId ||
      hasPermission(user.role, 'users:read') ||
      hasPermission(user.role, 'users:manage') ||
      hasPermission(user.role, 'kyc:validate') ||
      hasPermission(user.role, 'data:export')
    );
  }

  /**
   * Second niveau : cette PIÈCE PRÉCISE est-elle lisible ?
   *
   * Deux verrous que le premier niveau ne posait pas, et qui manquaient
   * entièrement :
   *
   *  1. **Pièces KYC** (identité, selfie, justificatif de domicile,
   *     justificatif de revenu) : `kyc:read_documents` exigée. `users:read`
   *     ouvrait jusqu'ici la photo de la carte d'identité de n'importe quel
   *     compte à support, marketing et chargé de relation investisseur ;
   *     `data:export` en faisait autant pour marketing.
   *  2. **Pièces en archivage restreint** (`archiveConservationLegale`, dossier
   *     KYC d'un compte supprimé conservé 5 ans, L. 561-12 CMF) :
   *     `kyc:read_archive` exigée, conformité seule. Le marqueur existait en
   *     base depuis le lot 2 et n'était filtré par AUCUNE lecture — un compte
   *     « supprimé » restait donc consultable comme avant par tout détenteur de
   *     `users:read`, ce qui vidait l'archivage restreint de son sens.
   *
   * Les deux verrous se cumulent : une pièce KYC archivée demande les deux
   * permissions. Le propriétaire de la pièce garde l'accès à ses propres
   * documents courants — mais pas à ceux qui ont basculé en archive, que le
   * barème veut hors de tout écran applicatif courant.
   */
  private canReadUserDocument(user: ActiveUser, doc: Document): boolean {
    if (doc.archiveConservationLegale) {
      return hasPermission(user.role, 'kyc:read_archive');
    }
    if (doc.userId !== null && doc.userId === user.userId) return true;
    if (!this.canListUserDocuments(user, doc.userId)) return false;
    if (estPieceKyc(doc.type)) {
      return hasPermission(user.role, 'kyc:read_documents');
    }
    return true;
  }

  private canManageProject(user: ActiveUser, project: ProjectEntity): boolean {
    return (
      project.porteurId === user.userId ||
      hasPermission(user.role, 'projects:manage')
    );
  }

  private canReadPrivateProject(
    user: ActiveUser,
    project: ProjectEntity,
  ): boolean {
    return (
      this.canManageProject(user, project) ||
      hasPermission(user.role, 'projects:read')
    );
  }

  private canReadInvestment(
    user: ActiveUser,
    investment: InvestmentEntity,
  ): boolean {
    return (
      investment.utilisateurId === user.userId ||
      hasPermission(user.role, 'users:read') ||
      hasPermission(user.role, 'projects:read') ||
      hasPermission(user.role, 'funds:disburse') ||
      hasPermission(user.role, 'kyc:validate')
    );
  }

  /**
   * Normalise un drapeau booleen du DTO. Le `@Transform` du DTO a deja fait le
   * travail lorsque la requete passe par le `ValidationPipe` global ; cette
   * seconde lecture est une defense en profondeur : elle garantit qu'une chaine
   * `"false"` ne devient jamais `true`, et que toute valeur non reconnue vaut
   * `false` (defaut ferme : un document n'est public que si on l'a demande).
   */
  private isTrue(value: unknown): boolean {
    return parseBooleanish(value) === true;
  }

  private async findProjectOrFail(projectId: string): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projet introuvable.');
    return project;
  }

  private async findInvestmentOrFail(
    investmentId: string,
  ): Promise<InvestmentEntity> {
    const investment = await this.investmentRepo.findOne({
      where: { id: investmentId },
    });
    if (!investment) throw new NotFoundException('Investissement introuvable.');
    return investment;
  }

  private async assertCanUpload(
    user: ActiveUser,
    dto: UploadDocumentDto,
    isPublic: boolean,
  ): Promise<void> {
    if (dto.relatedTo === DocumentRelatedTo.USER) {
      if (isPublic && !hasPermission(user.role, 'users:manage')) {
        throw new ForbiddenException('Acces refuse.');
      }
      return;
    }

    if (dto.relatedTo === DocumentRelatedTo.PROJECT) {
      if (!dto.projectId) throw new BadRequestException('projectId manquant.');
      const project = await this.findProjectOrFail(dto.projectId);
      if (!this.canManageProject(user, project)) {
        throw new ForbiddenException('Acces refuse.');
      }
      return;
    }

    if (dto.relatedTo === DocumentRelatedTo.INVESTMENT) {
      if (!dto.investmentId) {
        throw new BadRequestException('investmentId manquant.');
      }
      const investment = await this.findInvestmentOrFail(dto.investmentId);
      if (this.canReadInvestment(user, investment) && !isPublic) return;
      throw new ForbiddenException('Acces refuse.');
    }

    throw new BadRequestException('Cible de document invalide.');
  }

  private async assertCanReadDocument(
    user: ActiveUser,
    doc: Document,
  ): Promise<void> {
    // Les pièces d'un dossier utilisateur sont jugées AVANT le raccourci
    // « c'est moi qui l'ai téléversée » : un administrateur qui a déposé la
    // pièce d'identité d'un tiers ne doit pas garder un droit de lecture
    // personnel dessus après avoir perdu l'habilitation KYC, et une pièce
    // archivée ne se rouvre pas parce qu'on l'a soi-même déposée.
    if (doc.relatedTo === DocumentRelatedTo.USER) {
      if (this.canReadUserDocument(user, doc)) return;
      throw new NotFoundException('Document introuvable.');
    }

    if (doc.uploadedBy === user.userId) return;

    if (doc.relatedTo === DocumentRelatedTo.PROJECT) {
      if (doc.isPublic) return;
      if (!doc.projectId) throw new NotFoundException('Document introuvable.');
      const project = await this.findProjectOrFail(doc.projectId);
      if (this.canReadPrivateProject(user, project)) return;
      throw new NotFoundException('Document introuvable.');
    }

    if (doc.relatedTo === DocumentRelatedTo.INVESTMENT) {
      if (!doc.investmentId) {
        throw new NotFoundException('Document introuvable.');
      }
      const investment = await this.findInvestmentOrFail(doc.investmentId);
      if (this.canReadInvestment(user, investment)) return;
      throw new NotFoundException('Document introuvable.');
    }

    throw new NotFoundException('Document introuvable.');
  }

  private async assertCanManageDocument(
    user: ActiveUser,
    doc: Document,
  ): Promise<void> {
    // Une pièce en archivage restreint n'est supprimable PAR PERSONNE : sa
    // conservation est une obligation légale de cinq ans (art. L. 561-12 CMF)
    // et son unique voie de sortie est le cron de purge RGPD, à l'échéance.
    // Rien ne l'interdisait : `users:manage` ou `kyc:validate` suffisaient à
    // détruire un dossier que la loi impose de garder.
    if (doc.archiveConservationLegale) {
      throw new ForbiddenException(
        'Pièce en archivage de conservation légale : suppression impossible.',
      );
    }

    if (doc.relatedTo === DocumentRelatedTo.USER) {
      if (
        doc.uploadedBy === user.userId ||
        hasPermission(user.role, 'users:manage') ||
        hasPermission(user.role, 'kyc:validate')
      ) {
        return;
      }
      throw new NotFoundException('Document introuvable.');
    }

    if (doc.uploadedBy === user.userId) return;

    if (doc.relatedTo === DocumentRelatedTo.PROJECT) {
      if (!doc.projectId) throw new NotFoundException('Document introuvable.');
      const project = await this.findProjectOrFail(doc.projectId);
      if (this.canManageProject(user, project)) return;
      throw new NotFoundException('Document introuvable.');
    }

    if (doc.relatedTo === DocumentRelatedTo.INVESTMENT) {
      if (
        hasPermission(user.role, 'projects:manage') ||
        hasPermission(user.role, 'funds:disburse')
      ) {
        return;
      }
      throw new NotFoundException('Document introuvable.');
    }

    throw new NotFoundException('Document introuvable.');
  }

  @ApiOperation({
    summary: 'Uploader un document lie a un utilisateur, projet ou investissement',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string' },
        relatedTo: { type: 'string' },
        projectId: { type: 'string' },
        investmentId: { type: 'string' },
        isPublic: {
          type: 'boolean',
          description:
            'Accepte true/false, "true"/"false", "1"/"0". Absent = false.',
        },
        ordre: { type: 'integer', minimum: 0 },
        estPrincipale: {
          type: 'boolean',
          description:
            'Accepte true/false, "true"/"false", "1"/"0". Absent = false.',
        },
      },
      required: ['file', 'type', 'relatedTo'],
    },
  })
  @ApiResponse({ status: 201, description: 'Document enregistre' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Type de fichier non autorise. Formats acceptes : JPEG, PNG, WEBP, PDF',
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: ActiveUser,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant.');

    const isPublic = this.isTrue(dto.isPublic);
    await this.assertCanUpload(user, dto, isPublic);

    const folder =
      dto.relatedTo === DocumentRelatedTo.PROJECT
        ? 'projets'
        : dto.relatedTo === DocumentRelatedTo.INVESTMENT
          ? 'investissements'
          : 'utilisateurs';

    const { objectName, publicUrl } = await this.cloudStorage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder,
      isPublic,
    );

    const doc = new Document();
    doc.type = dto.type;
    doc.relatedTo = dto.relatedTo;
    doc.userId = dto.relatedTo === DocumentRelatedTo.USER ? user.userId : null;
    doc.projectId = dto.projectId ?? null;
    doc.investmentId = dto.investmentId ?? null;
    doc.originalName = file.originalname;
    doc.filename = objectName;
    doc.mimeType = file.mimetype;
    doc.sizeBytes = file.size;
    doc.path = publicUrl;
    doc.isPublic = isPublic;
    doc.uploadedBy = user.userId;
    doc.ordre = dto.ordre ?? null;
    doc.estPrincipale = this.isTrue(dto.estPrincipale);

    return this.documentRepository.save(doc);
  }

  @ApiOperation({ summary: 'Mes documents' })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  @Get('me')
  async getMyDocuments(@CurrentUser() user: ActiveUser) {
    const docs = await this.documentRepository.findByUserId(user.userId);
    // Une pièce archivée n'appartient qu'à un compte supprimé, qui ne peut plus
    // s'authentifier : le filtre est théorique. Il est posé quand même parce
    // que « archivage restreint » veut dire « hors de tout écran courant », et
    // qu'un marqueur qui ne dépend pas de l'appelant ne doit pas avoir une
    // exception par route.
    return docs.filter((d) => !d.archiveConservationLegale);
  }

  @ApiOperation({ summary: "Documents d'un utilisateur" })
  @ApiParam({ name: 'userId', description: "ID numerique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  @Get('user/:userId')
  async getByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: ActiveUser,
  ) {
    if (!this.canListUserDocuments(user, userId)) {
      throw new ForbiddenException('Acces refuse.');
    }
    // Le 403 ne porte que sur l'accès à la liste ; ce qu'elle CONTIENT est
    // filtré pièce par pièce. Un rôle sans `kyc:read_documents` voit donc que
    // le compte a des documents, sans voir les pièces d'identité — et sans
    // apprendre, par un refus global, qu'il y en a.
    const docs = await this.documentRepository.findByUserId(userId);
    return docs.filter((d) => this.canReadUserDocument(user, d));
  }

  @ApiOperation({ summary: 'Documents publics d un projet' })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Documents publics du projet' })
  @Public()
  @Get('public/project/:projectId')
  getPublicProjectDocs(@Param('projectId') projectId: string) {
    return this.documentRepository
      .findByProjectId(projectId)
      .then((docs) => docs.filter((d) => d.isPublic));
  }

  @ApiOperation({ summary: 'Images publiques d un projet' })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des images du projet' })
  @Public()
  @Get('public/project/:projectId/images')
  getProjectImages(@Param('projectId') projectId: string) {
    return this.documentRepository
      .findProjectImages(projectId)
      .then((docs) => docs.filter((d) => d.isPublic));
  }

  @ApiOperation({ summary: 'Documents lies a un projet' })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Documents du projet' })
  @Get('project/:projectId')
  async getByProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const docs = await this.documentRepository.findByProjectId(projectId);
    const project = await this.findProjectOrFail(projectId);
    if (this.canReadPrivateProject(user, project)) return docs;
    return docs.filter((d) => d.isPublic);
  }

  @ApiOperation({ summary: 'Documents lies a un investissement' })
  @ApiParam({ name: 'investmentId', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: "Documents de l'investissement" })
  @Get('investment/:investmentId')
  async getByInvestment(
    @Param('investmentId') investmentId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const investment = await this.findInvestmentOrFail(investmentId);
    if (!this.canReadInvestment(user, investment)) {
      throw new ForbiddenException('Acces refuse.');
    }
    return this.documentRepository.findByInvestmentId(investmentId);
  }

  @ApiOperation({ summary: "Detail d'un document" })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiResponse({ status: 200, description: 'Document trouve' })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    await this.assertCanReadDocument(user, doc);
    return doc;
  }

  @ApiOperation({ summary: 'URL de telechargement securisee' })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiResponse({ status: 302, description: 'Redirection vers le fichier' })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  @Get(':id/download')
  @Redirect()
  async download(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    await this.assertCanReadDocument(user, doc);

    if (doc.isPublic) {
      if (!doc.path.startsWith('https://')) {
        throw new NotFoundException('Fichier introuvable.');
      }
      return { url: doc.path };
    }

    const signedUrl = await this.cloudStorage.getSignedUrl(
      doc.filename,
      60,
      doc.mimeType === 'application/pdf' ? 'raw' : 'image',
    );
    return { url: signedUrl };
  }

  @ApiOperation({ summary: 'Supprimer un document' })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiResponse({ status: 204, description: 'Document supprime' })
  @ApiResponse({ status: 404, description: 'Document introuvable ou non autorise' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    await this.assertCanManageDocument(user, doc);

    await this.cloudStorage.delete(doc.filename);
    await this.documentRepository.delete(id);
  }

  @ApiOperation({ summary: 'Definir une image comme principale d un projet' })
  @ApiParam({ name: 'id', description: 'UUID du document PHOTO_PROJET' })
  @ApiResponse({ status: 200, description: 'Image definie comme principale' })
  @Patch(':id/set-main')
  async setMainImage(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.type !== DocumentType.PHOTO_PROJET) {
      throw new BadRequestException(
        'Seules les PHOTO_PROJET peuvent etre definies comme principale.',
      );
    }
    if (!doc.projectId) {
      throw new BadRequestException("Ce document n'est pas lie a un projet.");
    }
    const project = await this.findProjectOrFail(doc.projectId);
    if (!this.canManageProject(user, project)) {
      throw new ForbiddenException('Acces refuse.');
    }
    return this.documentRepository.setMainImage(id, doc.projectId);
  }

  @ApiOperation({ summary: "Modifier l'ordre d'affichage d'une image de projet" })
  @ApiParam({ name: 'id', description: 'UUID du document PHOTO_PROJET' })
  @ApiBody({ type: SetOrdreDto })
  @ApiResponse({ status: 200, description: 'Ordre mis a jour' })
  @Patch(':id/ordre')
  async setOrdre(
    @Param('id') id: string,
    @Body() dto: SetOrdreDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.type !== DocumentType.PHOTO_PROJET) {
      throw new BadRequestException(
        "Seules les PHOTO_PROJET ont un ordre d'affichage.",
      );
    }
    if (!doc.projectId) {
      throw new BadRequestException("Ce document n'est pas lie a un projet.");
    }
    const project = await this.findProjectOrFail(doc.projectId);
    if (!this.canManageProject(user, project)) {
      throw new ForbiddenException('Acces refuse.');
    }
    return this.documentRepository.updateOrdre(id, dto.ordre);
  }
}
