import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { Public } from 'src/common/auth/public.decorator';
import { DOCUMENT_REPOSITORY } from 'src/documents/applications/ports/repositories/document.repository';
import type { DocumentRepository } from 'src/documents/applications/ports/repositories/document.repository';
import { Document } from 'src/documents/domains/document';
import { DocumentRelatedTo, DocumentType } from 'src/documents/domains/enums/document-type.enum';
import { SetOrdreDto, UploadDocumentDto } from '../dto/document.dto';

const UPLOADS_DIR = join(process.cwd(), 'uploads');
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
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
  ) {}

  @ApiOperation({ summary: 'Uploader un document (lié à un utilisateur, projet ou investissement)' })
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
        isPublic: { type: 'boolean' },
      },
      required: ['file', 'type', 'relatedTo'],
    },
  })
  @ApiResponse({ status: 201, description: 'Document enregistré' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WEBP, PDF',
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

    const doc = new Document();
    doc.type = dto.type;
    doc.relatedTo = dto.relatedTo;
    doc.userId =
      dto.relatedTo === DocumentRelatedTo.USER ? user.userId : null;
    doc.projectId = dto.projectId ?? null;
    doc.investmentId = dto.investmentId ?? null;
    doc.originalName = file.originalname;
    doc.filename = file.filename;
    doc.mimeType = file.mimetype;
    doc.sizeBytes = file.size;
    doc.path = file.path;
    doc.isPublic = dto.isPublic ?? false;
    doc.uploadedBy = user.userId;
    doc.ordre = dto.ordre ?? null;
    doc.estPrincipale = dto.estPrincipale ?? false;

    return this.documentRepository.save(doc);
  }

  @ApiOperation({ summary: 'Mes documents' })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  @Get('me')
  getMyDocuments(@CurrentUser() user: ActiveUser) {
    return this.documentRepository.findByUserId(user.userId);
  }

  @ApiOperation({ summary: "Documents d'un utilisateur (admin)" })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Liste des documents' })
  @Get('user/:userId')
  getByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.documentRepository.findByUserId(userId);
  }

  @ApiOperation({ summary: "Documents liés à un projet" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Documents du projet' })
  @Get('project/:projectId')
  getByProject(@Param('projectId') projectId: string) {
    return this.documentRepository.findByProjectId(projectId);
  }

  @ApiOperation({ summary: "Documents liés à un investissement" })
  @ApiParam({ name: 'investmentId', description: "UUID de l'investissement" })
  @ApiResponse({ status: 200, description: "Documents de l'investissement" })
  @Get('investment/:investmentId')
  getByInvestment(@Param('investmentId') investmentId: string) {
    return this.documentRepository.findByInvestmentId(investmentId);
  }

  @ApiOperation({ summary: "Détail d'un document" })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiResponse({ status: 200, description: 'Document trouvé' })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    return doc;
  }

  @ApiOperation({ summary: "Télécharger le fichier d'un document" })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiProduces('application/octet-stream', 'application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 200, description: 'Flux binaire du fichier (PDF ou image)' })
  @ApiResponse({ status: 404, description: 'Document ou fichier introuvable' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ): Promise<StreamableFile> {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');

    if (!doc.isPublic && doc.uploadedBy !== user.userId) {
      throw new NotFoundException('Document introuvable.');
    }

    if (!existsSync(doc.path)) {
      throw new NotFoundException('Fichier introuvable sur le serveur.');
    }

    return new StreamableFile(createReadStream(doc.path), {
      type: doc.mimeType,
      disposition: `attachment; filename="${doc.originalName}"`,
    });
  }

  @ApiOperation({ summary: 'Supprimer un document' })
  @ApiParam({ name: 'id', description: 'UUID du document' })
  @ApiResponse({ status: 204, description: 'Document supprimé' })
  @ApiResponse({ status: 404, description: 'Document introuvable ou non autorisé' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.uploadedBy !== user.userId) {
      throw new NotFoundException('Document introuvable.');
    }

    if (existsSync(doc.path)) {
      await unlink(doc.path);
    }

    await this.documentRepository.delete(id);
  }

  @ApiOperation({ summary: "Documents publics d'un projet (accès sans auth)" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Prospectus et documents publics du projet' })
  @Public()
  @Get('public/project/:projectId')
  getPublicProjectDocs(@Param('projectId') projectId: string) {
    return this.documentRepository
      .findByProjectId(projectId)
      .then((docs) => docs.filter((d) => d.isPublic));
  }

  @ApiOperation({ summary: "Images d'un projet (PHOTO_PROJET), triées par ordre puis date" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des images du projet (principale en premier)' })
  @Public()
  @Get('public/project/:projectId/images')
  getProjectImages(@Param('projectId') projectId: string) {
    return this.documentRepository.findProjectImages(projectId);
  }

  @ApiOperation({ summary: "Définir une image comme principale d'un projet" })
  @ApiParam({ name: 'id', description: 'UUID du document PHOTO_PROJET' })
  @ApiResponse({ status: 200, description: 'Image définie comme principale' })
  @ApiResponse({ status: 400, description: 'Le document n\'est pas une PHOTO_PROJET' })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  @Patch(':id/set-main')
  async setMainImage(
    @Param('id') id: string,
    @CurrentUser() _user: ActiveUser,
  ) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.type !== DocumentType.PHOTO_PROJET) {
      throw new BadRequestException('Seules les PHOTO_PROJET peuvent être définies comme principale.');
    }
    if (!doc.projectId) {
      throw new BadRequestException('Ce document n\'est pas lié à un projet.');
    }
    return this.documentRepository.setMainImage(id, doc.projectId);
  }

  @ApiOperation({ summary: "Modifier l'ordre d'affichage d'une image de projet" })
  @ApiParam({ name: 'id', description: 'UUID du document PHOTO_PROJET' })
  @ApiBody({ type: SetOrdreDto })
  @ApiResponse({ status: 200, description: 'Ordre mis à jour' })
  @ApiResponse({ status: 400, description: 'Le document n\'est pas une PHOTO_PROJET' })
  @ApiResponse({ status: 404, description: 'Document introuvable' })
  @Patch(':id/ordre')
  async setOrdre(
    @Param('id') id: string,
    @Body() dto: SetOrdreDto,
    @CurrentUser() _user: ActiveUser,
  ) {
    const doc = await this.documentRepository.findById(id);
    if (!doc) throw new NotFoundException('Document introuvable.');
    if (doc.type !== DocumentType.PHOTO_PROJET) {
      throw new BadRequestException('Seules les PHOTO_PROJET ont un ordre d\'affichage.');
    }
    return this.documentRepository.updateOrdre(id, dto.ordre);
  }
}
