import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
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
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { GererPhotosDuProjetUseCase } from 'src/catalog/application/usecases/project/gerer-photos-du-projet.usecase';
import { TYPES_IMAGE_ACCEPTES } from 'src/catalog/domain/entities/photo-projet';
import { DecrirePhotoDto, DeplacerDto } from './dto/contenu-projet.dto';
import { ApiFicheProjet } from './fiche-projet.response';

/** Une photo de fiche n'a pas à peser plus qu'une photo de fiche. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

/**
 * La galerie d'une fiche projet : sa vignette et ses vues.
 *
 * **Ces routes remplacent celles de `DocumentController`** — l'upload d'un
 * `PHOTO_PROJET`, `PATCH /documents/:id/set-main`, `PATCH /documents/:id/ordre`
 * et `GET /documents/public/project/:id/images`. Les photos sont du contenu
 * éditorial de la fiche, pas des pièces qui se signent : elles vivent désormais
 * dans l'agrégat `Project` (§3.2, M4), et leurs routes sous le projet qu'elles
 * illustrent.
 *
 * Il n'y a plus de route de **lecture** ici, et c'est le point : la galerie est
 * dans le projet. `GET /projects/:id`, `GET /projects/public`,
 * `GET /projects/slug/:slug` et le lien de partage la rendent déjà, sous les
 * clés `photos` et `images`. La lire séparément coûtait une requête par projet
 * en page de catalogue.
 *
 * **Autorisation** : `projects:manage`, comme `PATCH /projects/:id`. Le dépôt
 * d'un document de projet acceptait aussi le porteur du projet
 * (`project.porteurId === user.userId`) ; l'édition du contenu de la fiche est
 * une capacité d'administration — le porteur soumet un dossier, il ne rédige pas
 * la fiche publiée. C'est déjà la règle pour tous les autres champs éditoriaux.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects/:projectId/photos')
export class ProjectPhotosController {
  constructor(private readonly photos: GererPhotosDuProjetUseCase) {}

  @ApiOperation({
    summary: 'Déposer une photo dans la galerie du projet (admin)',
    description:
      'La première photo déposée devient la vignette du projet. Formats acceptés : JPEG, PNG, WEBP.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG ou WEBP. 10 Mo au plus.',
        },
        texteAlternatif: {
          type: 'string',
          description: 'Optionnel — accessibilité et référencement.',
        },
      },
      required: ['file'],
    },
  })
  @ApiFicheProjet(
    'Projet avec sa galerie à jour — la photo est ajoutée en fin de galerie, sauf si elle est la première (elle devient alors la vignette)',
    201,
  )
  @ApiResponse({
    status: 400,
    description:
      'Fichier manquant, ou format refusé (`IMAGE_DE_PROJET_INVALIDE`) — un PDF est refusé ici, alors que l’ancien dépôt de document l’acceptait comme photo',
  })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @RequirePermission('projects:manage')
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TAILLE_MAX_OCTETS },
      // Premier filtre, sur la forme : il évite de charger en mémoire un
      // fichier que le domaine refusera. `PhotoProjet.deposer` reste seul juge
      // — ce filtre-ci ne protège que ce point d'entrée.
      fileFilter: (_req, file, cb) => {
        if (TYPES_IMAGE_ACCEPTES.includes(file.mimetype)) return cb(null, true);
        cb(
          new BadRequestException(
            'Format non autorisé pour une photo de projet. Formats acceptés : JPEG, PNG, WEBP.',
          ),
          false,
        );
      },
    }),
  )
  deposer(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('texteAlternatif') texteAlternatif: string | undefined,
    @CurrentUser() user: ActiveUser,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant.');

    return this.photos.ajouter(
      projectId,
      {
        contenu: file.buffer,
        nomOriginal: file.originalname,
        mimeType: file.mimetype,
        tailleOctets: file.size,
      },
      { par: user.userId, texteAlternatif },
    );
  }

  @ApiOperation({
    summary: 'Désigner la vignette du projet (admin)',
    description:
      "La photo passe en tête de galerie (`position: 0`), et l'ancienne vignette cesse d'en être une du seul fait d'avoir reculé. Remplace `PATCH /documents/{id}/set-main`, qui procédait par deux écritures successives sans garantie d'unicité.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'photoId', description: 'UUID de la photo' })
  @ApiFicheProjet(
    'Projet avec sa galerie à jour — la photo désignée est en `position: 0`',
  )
  @ApiResponse({
    status: 404,
    description:
      'Projet introuvable, ou photo absente de cette galerie (`PHOTO_DE_PROJET_INTROUVABLE`)',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':photoId/principale')
  designerPrincipale(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photos.designerPrincipale(projectId, photoId);
  }

  @ApiOperation({
    summary: 'Déplacer une photo dans la galerie (admin)',
    description:
      "Déplacer **vers** `position: 0` fait de cette photo la vignette : c'est le même geste que `PATCH /photos/{photoId}/principale`, et il n'y en a pas d'autre — la vignette *est* la photo de rang 0. Remplace `PATCH /documents/{id}/ordre`.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'photoId', description: 'UUID de la photo' })
  @ApiFicheProjet('Projet avec sa galerie à jour — les rangs sont renumérotés')
  @ApiResponse({
    status: 400,
    description:
      '`POSITION_DE_PHOTO_INVALIDE` — la position doit tenir entre 0 et n-1',
  })
  @ApiResponse({ status: 404, description: 'Projet ou photo introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':photoId/position')
  deplacer(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
    @Body() dto: DeplacerDto,
  ) {
    return this.photos.deplacer(projectId, photoId, dto.position);
  }

  @ApiOperation({
    summary: "Réécrire le texte alternatif d'une photo (admin)",
    description: 'Accessibilité et référencement de la fiche publique.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'photoId', description: 'UUID de la photo' })
  @ApiFicheProjet('Projet avec sa galerie à jour')
  @ApiResponse({ status: 404, description: 'Projet ou photo introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':photoId')
  decrire(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
    @Body() dto: DecrirePhotoDto,
  ) {
    return this.photos.decrire(projectId, photoId, dto.texteAlternatif ?? null);
  }

  @ApiOperation({
    summary: 'Retirer une photo de la galerie (admin)',
    description:
      "Si c'était la vignette, la photo suivante la remplace — une fiche ne reste pas sans illustration.",
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'photoId', description: 'UUID de la photo' })
  @ApiFicheProjet(
    'Projet avec sa galerie à jour. Le fichier est effacé du stockage dans la foulée ; si cet effacement échoue, la réponse reste un succès — la photo a bien quitté la fiche — et l’objet orphelin est journalisé.',
  )
  @ApiResponse({
    status: 404,
    description:
      'Projet introuvable, ou photo absente de cette galerie (`PHOTO_DE_PROJET_INTROUVABLE`)',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Delete(':photoId')
  retirer(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photos.retirer(projectId, photoId);
  }
}
