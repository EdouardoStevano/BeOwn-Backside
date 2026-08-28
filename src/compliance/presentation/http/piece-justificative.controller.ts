import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
import {
  PIECES_EXIGEES_DE_LA_SOCIETE,
  PIECES_EXIGEES_DU_BENEFICIAIRE,
} from 'src/compliance/domain/enums/type-piece-justificative.enum';
import {
  DeposerPieceUseCase,
  type FaceDeposee,
} from 'src/compliance/application/usecases/pieces/deposer-piece.usecase';
import { ConsulterDossierDePiecesUseCase } from 'src/compliance/application/usecases/pieces/consulter-dossier-de-pieces.usecase';
import {
  DeposerPieceDto,
  DeposerPieceDuBeneficiaireDto,
} from './dto/piece-justificative.dto';

/** Même borne que le contexte `documents` — un scan de KBIS ne pèse pas plus. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

const MIMES_ACCEPTES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Ce que `FileFieldsInterceptor` range dans la requête : un tableau par champ
 * déclaré, absent si le champ n'a rien reçu.
 */
interface FichiersDeposes {
  file?: Express.Multer.File[];
  verso?: Express.Multer.File[];
}

/**
 * Deux champs plutôt qu'un : une pièce d'identité se dépose des deux faces, en
 * un seul appel. Les envoyer par deux requêtes aurait laissé exister, entre les
 * deux, une pièce à moitié déposée que l'instruction aurait pu prendre pour un
 * document complet.
 *
 * **Partagé par les deux routes**, y compris celle de la société qui n'attend
 * jamais de verso : c'est le domaine qui refuse un dos sur un KBIS, avec un
 * message qui dit pourquoi. Ne pas déclarer le champ ici ferait rejeter la
 * requête par Multer en amont, par une erreur technique que personne ne sait
 * lire (§21 — les erreurs métier restent séparées des erreurs techniques).
 */
const INTERCEPTEUR_DES_FACES = FileFieldsInterceptor(
  [
    { name: 'file', maxCount: 1 },
    { name: 'verso', maxCount: 1 },
  ],
  {
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
  },
);

/** Le fichier multipart, réduit à ce que la couche applicative attend. */
function face(fichier: Express.Multer.File): FaceDeposee {
  return {
    contenu: fichier.buffer,
    nomOrigine: fichier.originalname,
    mimeType: fichier.mimetype,
    tailleOctets: fichier.size,
  };
}

/**
 * Les pièces justificatives du dossier personne morale.
 *
 * **Deux routes de dépôt, parce qu'il y a deux choses à documenter** :
 *
 * | Route                          | Ce qu'elle documente | Pièces                                |
 * | ------------------------------ | -------------------- | ------------------------------------- |
 * | `POST .../pieces`              | l'entreprise         | KBIS, statuts, liste des actionnaires |
 * | `POST .../pieces/:beneficiaireId` | une personne      | DBE-S1, pièce d'identité              |
 *
 * La personne documentée est **dans le chemin**, où elle désigne la ressource,
 * et non dans le corps où elle n'était qu'un champ parmi d'autres. Le gain
 * n'est pas cosmétique : un dépôt qui oubliait `beneficiaireId` ne se
 * distinguait pas d'un dépôt de société, et c'est au domaine qu'il revenait de
 * rattraper l'ambiguïté. Ici l'URL ne peut pas être à moitié renseignée, et
 * chaque route n'annonce dans Swagger que les types qu'elle accepte.
 *
 * Le domaine reste l'autorité : `DossierDePieces.deposer` refuse un DBE-S1 sans
 * bénéficiaire comme un KBIS avec. Le découpage des routes ne remplace pas
 * cette règle, il évite de l'atteindre (§14).
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
      'Les trois documents qui décrivent l’entreprise : KBIS de moins de ' +
      'trois mois, statuts à jour et signés, liste des actionnaires. Une seule ' +
      'pièce de chaque type par société — redéposer remplace la précédente et ' +
      'remet son instruction en attente : c’est le geste par lequel le ' +
      'titulaire corrige un document refusé.\n\n' +
      'Les pièces d’un bénéficiaire effectif — DBE-S1, pièce d’identité — se ' +
      'déposent sur `POST /profiles/pm/{societeId}/pieces/{beneficiaireId}`, ' +
      'et sont refusées ici : elles documentent une personne, pas la société.',
  })
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: [...PIECES_EXIGEES_DE_LA_SOCIETE],
        },
        dateEmission: { type: 'string', example: '2026-08-01' },
      },
      required: ['file', 'type'],
    },
  })
  @ApiResponse({ status: 201, description: 'Pièce déposée ; dossier retourné' })
  @ApiResponse({
    status: 400,
    description: 'Fichier invalide, ou type réservé aux bénéficiaires',
  })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @Post()
  @UseInterceptors(INTERCEPTEUR_DES_FACES)
  deposer(
    @CurrentUser() user: ActiveUser,
    @Param('societeId') societeId: string,
    @UploadedFiles() fichiers: FichiersDeposes,
    @Body() dto: DeposerPieceDto,
  ) {
    return this.deposerPiece.execute(user.userId, {
      societeId,
      type: dto.type,
      // Aucun bénéficiaire, et il n'y a pas de chemin pour en fournir un : ces
      // trois documents décrivent l'entreprise prise comme un tout.
      beneficiaireId: null,
      dateEmission: dto.dateEmission ? new Date(dto.dateEmission) : null,
      ...this.faces(fichiers),
    });
  }

  @ApiOperation({
    summary: 'Déposer ou remplacer une pièce justificative d’un bénéficiaire',
    description:
      'Deux documents par bénéficiaire effectif déclaré : son formulaire ' +
      'DBE-S1 et sa pièce d’identité. Une seule pièce de chaque type par ' +
      'personne — redéposer remplace la précédente et remet son instruction ' +
      'en attente.\n\n' +
      '`verso` est **obligatoire** pour `piece_identite_beneficiaire` : la ' +
      'date d’expiration est au dos, et un recto seul ne permet pas de ' +
      'vérifier que la pièce est encore valide. Il est refusé pour le DBE-S1.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'societeId',
    description: 'UUID du profil personne morale',
  })
  @ApiParam({
    name: 'beneficiaireId',
    description:
      'UUID du bénéficiaire effectif documenté. Il doit être déclaré au ' +
      'registre de **cette** société.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        verso: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: [...PIECES_EXIGEES_DU_BENEFICIAIRE],
        },
        dateEmission: { type: 'string', example: '2026-08-01' },
      },
      required: ['file', 'type'],
    },
  })
  @ApiResponse({ status: 201, description: 'Pièce déposée ; dossier retourné' })
  @ApiResponse({
    status: 400,
    description:
      'Fichier ou verso invalide, bénéficiaire inconnu de cette société, ou ' +
      'type réservé à la société',
  })
  @ApiResponse({ status: 404, description: 'Société introuvable' })
  @Post(':beneficiaireId')
  @UseInterceptors(INTERCEPTEUR_DES_FACES)
  deposerPourLeBeneficiaire(
    @CurrentUser() user: ActiveUser,
    @Param('societeId') societeId: string,
    @Param('beneficiaireId', ParseUUIDPipe) beneficiaireId: string,
    @UploadedFiles() fichiers: FichiersDeposes,
    @Body() dto: DeposerPieceDuBeneficiaireDto,
  ) {
    return this.deposerPiece.execute(user.userId, {
      societeId,
      type: dto.type,
      // Il vient du chemin : une URL ne peut pas être à moitié renseignée,
      // là où un champ de corps absent passait pour un dépôt de société.
      beneficiaireId,
      dateEmission: dto.dateEmission ? new Date(dto.dateEmission) : null,
      ...this.faces(fichiers),
    });
  }

  /**
   * Les deux faces reçues, réduites à ce que la couche applicative attend.
   *
   * Commune aux deux routes : elles diffèrent par ce qu'elles documentent, pas
   * par la façon dont les octets arrivent.
   */
  private faces(fichiers: FichiersDeposes) {
    const recto = fichiers?.file?.[0];
    if (!recto) throw new BadRequestException('Fichier manquant.');

    const verso = fichiers?.verso?.[0];

    return {
      fichier: face(recto),
      // `null` et non `undefined` : le domaine oppose « aucun verso » à
      // « verso exigé », et c'est lui qui refuse le dépôt incohérent.
      verso: verso ? face(verso) : null,
    };
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
