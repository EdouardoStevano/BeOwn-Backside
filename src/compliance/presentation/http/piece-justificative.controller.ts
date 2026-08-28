import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { DeposerPieceUseCase } from 'src/compliance/application/usecases/pieces/deposer-piece.usecase';
import { ConsulterDossierDePiecesUseCase } from 'src/compliance/application/usecases/pieces/consulter-dossier-de-pieces.usecase';
import { DeposerPieceDto } from './dto/piece-justificative.dto';

/** Même borne que le contexte `documents` — un scan de KBIS ne pèse pas plus. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

const MIMES_ACCEPTES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Les pièces justificatives du dossier personne morale.
 *
 * Le cahier des charges en exige quatre par société — KBIS de moins de trois
 * mois, statuts à jour et signés, liste des actionnaires, formulaire DBE-S1 —
 * plus une pièce d'identité par bénéficiaire effectif déclaré.
 *
 * **Les routes sont sous la société, pas sous le compte.** Un titulaire peut
 * en déclarer plusieurs : `/profiles/pm/:societeId/pieces` désigne sans
 * ambiguïté de quel dossier il s'agit, là où un `/profiles/pm/me/pieces`
 * obligerait à en choisir une arbitrairement.
 *
 * La pièce d'identité du **titulaire** n'est pas ici : elle est capturée et
 * contrôlée par le parcours hébergé du fournisseur d'identité, qui en reste la
 * seule source faisant foi (voir `TypePieceJustificative`).
 */
@ApiTags('Conformité — Pièces justificatives (personne morale)')
@ApiBearerAuth()
@Controller('profiles/pm/:societeId/pieces')
@UseGuards(JwtAuthGuard)
export class PieceJustificativeController {
  constructor(
    private readonly deposerPiece: DeposerPieceUseCase,
    private readonly consulterDossier: ConsulterDossierDePiecesUseCase,
  ) {}

  @ApiOperation({
    summary: 'Déposer ou remplacer une pièce justificative de ma société',
    description:
      'Une seule pièce de chaque type par société : redéposer remplace la ' +
      'précédente et remet son instruction en attente. C’est le geste par ' +
      'lequel le titulaire corrige un document refusé.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.values(TypePieceJustificative) },
        beneficiaireId: { type: 'string' },
        dateEmission: { type: 'string', example: '2026-08-01' },
      },
      required: ['file', 'type'],
    },
  })
  @ApiResponse({ status: 201, description: 'Pièce déposée ; dossier retourné' })
  @ApiResponse({ status: 400, description: 'Fichier ou bénéficiaire invalide' })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TAILLE_MAX_OCTETS },
      fileFilter: (_req, file, cb) => {
        if (MIMES_ACCEPTES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Format non accepté. Formats acceptés : PDF, JPEG, PNG, WEBP.',
            ),
            false,
          );
        }
      },
    }),
  )
  deposer(
    @CurrentUser() user: ActiveUser,
    @Param('societeId') societeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: DeposerPieceDto,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant.');

    return this.deposerPiece.execute(user.userId, {
      societeId,
      type: dto.type,
      // Le DTO rend `undefined` une clé absente ; le domaine distingue
      // « pas de bénéficiaire » de « non renseigné » par `null`.
      beneficiaireId: dto.beneficiaireId ?? null,
      dateEmission: dto.dateEmission ? new Date(dto.dateEmission) : null,
      fichier: {
        contenu: file.buffer,
        nomOrigine: file.originalname,
        mimeType: file.mimetype,
        tailleOctets: file.size,
      },
    });
  }

  @ApiOperation({
    summary: 'Où en est le dossier de pièces de ma société',
    description:
      'Rend les pièces déposées avec leur statut, ce qui manque encore et ' +
      'pourquoi — jamais déposée, refusée, en attente d’instruction, ou ' +
      'périmée — et le verdict de complétude.',
  })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiResponse({ status: 200, description: 'Dossier retourné' })
  @Get()
  consulter(
    @CurrentUser() user: ActiveUser,
    @Param('societeId') societeId: string,
  ) {
    return this.consulterDossier.execute(user.userId, societeId);
  }
}
