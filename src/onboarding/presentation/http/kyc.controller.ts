import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import {
  hasPermission,
  rolesWithPermission,
} from 'src/iam/domain/policies/role-permissions.policy';
import { CreateKycUseCase } from 'src/onboarding/application/usecases/kyc/create-kyc.usecase';
import { GetKycUseCase } from 'src/onboarding/application/usecases/kyc/get-kyc.usecase';
import { GetKycImagesUseCase } from 'src/onboarding/application/usecases/kyc/get-kyc-images.usecase';
import { RequestKycManualReviewUseCase } from 'src/onboarding/application/usecases/kyc/request-kyc-manual-review.usecase';
import { DecideKycManualReviewUseCase } from 'src/onboarding/application/usecases/kyc/decide-kyc-manual-review.usecase';
import { StartKycSessionUseCase } from 'src/onboarding/application/usecases/kyc/start-kyc-session.usecase';
import { ConsultKycSessionUseCase } from 'src/onboarding/application/usecases/kyc/consult-kyc-session.usecase';
import { SynchroniserLaVerificationUseCase } from 'src/onboarding/application/usecases/kyc/synchroniser-la-verification.usecase';
import { DeposerPieceIdentiteUseCase } from 'src/onboarding/application/usecases/kyc/deposer-piece-identite.usecase';
import type { FaceDeposee } from 'src/onboarding/application/usecases/pieces/deposer-piece.usecase';
import { TypePieceIdentite } from 'src/onboarding/domain/enums/type-piece-identite.enum';
import { DeposerPieceIdentiteDto, UpdateKycStatusDto } from './dto/kyc.dto';

/** Rôles détenant `kyc:validate` — Compliance (+ super_admin via wildcard). */
const KYC_REVIEWER_ROLES: string[] = rolesWithPermission('kyc:validate');

/** 10 Mo : au-delà, c'est un scan non compressé, pas un justificatif. */
const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;

const MIMES_ACCEPTES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Ce que `FileFieldsInterceptor` range dans la requête, un tableau par champ. */
interface FacesDeposees {
  recto?: Express.Multer.File[];
  verso?: Express.Multer.File[];
}

/**
 * Les deux faces arrivent en **un seul appel**.
 *
 * Les envoyer par deux requêtes aurait laissé exister, entre les deux, une
 * pièce à moitié déposée que l'instruction aurait pu prendre pour un document
 * complet. `verso` est déclaré même pour les trois documents qui n'en ont pas :
 * c'est le domaine qui répond alors 400 en disant pourquoi, là où Multer aurait
 * rejeté la requête par une erreur technique que personne ne sait lire (§21).
 */
const INTERCEPTEUR_DES_FACES = FileFieldsInterceptor(
  [
    { name: 'recto', maxCount: 1 },
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
 * Point d'entrée HTTP du contexte KYC.
 *
 * Rassemble sous `/kyc` des routes qui vivaient dans deux contrôleurs de deux
 * autres contextes : `ProfileController` (ouverture du dossier, revue manuelle,
 * décision admin, lectures) et `PaymentController` (session Stripe Identity,
 * images). Les anciennes URLs restent servies par {@link KycLegacyController},
 * le temps que le front migre.
 *
 * Le contrôleur ne fait que router (§12.5) : valider le DTO, établir qui
 * appelle, passer au use case. Les deux seules choses qu'il décide sont des
 * questions d'identité — `assertKycReviewer` et la traduction de la permission
 * `kyc:validate` en booléen pour les use cases de session.
 */
@ApiTags('KYC')
@ApiBearerAuth()
@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(
    private readonly createKyc: CreateKycUseCase,
    private readonly getKyc: GetKycUseCase,
    private readonly getKycImages: GetKycImagesUseCase,
    private readonly requestKycManualReview: RequestKycManualReviewUseCase,
    private readonly decideKycManualReview: DecideKycManualReviewUseCase,
    private readonly startKycSession: StartKycSessionUseCase,
    private readonly consultKycSession: ConsultKycSessionUseCase,
    private readonly synchroniserLaVerification: SynchroniserLaVerificationUseCase,
    private readonly deposerPieceIdentite: DeposerPieceIdentiteUseCase,
    // Port du contexte IAM : le contrôleur relit le rôle du compte, il n'a pas
    // à connaître la table qui le porte (§12.9).
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  /** Défense en profondeur : mutation KYC réservée à `kyc:validate` (Compliance + super_admin). */
  private async assertKycReviewer(user: ActiveUser): Promise<void> {
    const compte = await this.userRepository.findById(user.userId);
    if (!compte || !KYC_REVIEWER_ROLES.includes(compte.role)) {
      throw new ForbiddenException(
        'Action réservée aux équipes admin / compliance.',
      );
    }
  }

  // ─── Dossier ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Initialiser mon dossier KYC' })
  @ApiResponse({ status: 201, description: 'KYC créé' })
  @Post('me')
  initKyc(@CurrentUser() user: ActiveUser) {
    return this.createKyc.execute(user.userId);
  }

  @ApiOperation({ summary: 'Obtenir mon KYC' })
  @ApiResponse({ status: 200, description: 'KYC retourné' })
  @Get('me')
  getMyKyc(@CurrentUser() user: ActiveUser) {
    return this.getKyc.execute(user.userId);
  }

  @ApiOperation({ summary: 'Lister tous les KYC (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des KYC avec données utilisateur',
  })
  @RequirePermission('kyc:validate')
  @Get('all')
  listAllKyc(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.getKyc.executeAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // ─── Revue manuelle ───────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Passer mon KYC en revue manuelle (dépôt manuel de documents)',
    description:
      "Fallback quand la vérification automatique Stripe Identity n'aboutit " +
      'pas (pas de réponse webhook, statut bloqué). Après téléversement manuel ' +
      "de la pièce d'identité + selfie, l'utilisateur passe son dossier en " +
      'revue manuelle (EN_REVUE) ; la compliance est notifiée pour décision ' +
      'via la route de décision manuelle existante.',
  })
  @ApiResponse({ status: 200, description: 'Dossier passé en revue manuelle' })
  @HttpCode(HttpStatus.OK)
  @Post('me/manual-review')
  requestManualReview(@CurrentUser() user: ActiveUser) {
    // L'alerte de la compliance suit le dossier : elle est déclenchée par
    // `KycRevueManuelleDemandeeEventHandler`, abonné au fait métier levé par le
    // use case. Le contrôleur ne sait pas quels rôles prévenir (§12.5).
    return this.requestKycManualReview.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Déposer ma pièce d’identité pour la revue manuelle',
    description:
      'Le recours quand la vérification automatique n’aboutit pas — refus, ' +
      'revue requise, ou parcours jamais ouvert. **Le dépôt vaut demande de ' +
      'revue** : il fait passer le dossier en `EN_REVUE` et prévient la ' +
      'conformité, sans qu’il faille appeler `me/manual-review` en plus.\n\n' +
      'Quatre documents acceptés. `verso` est obligatoire pour la **seule** ' +
      'carte nationale d’identité, dont la date d’expiration est au dos ; il ' +
      'est refusé pour le passeport, le permis de conduire et le titre de ' +
      'séjour, qui se prouvent d’une seule page.\n\n' +
      'Redéposer remplace : un dossier ne porte qu’une pièce d’identité.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        recto: { type: 'string', format: 'binary' },
        verso: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.values(TypePieceIdentite) },
      },
      required: ['recto', 'type'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Pièce déposée ; dossier passé en revue manuelle',
  })
  @ApiResponse({
    status: 400,
    description: 'Fichier invalide, ou verso incohérent avec le type',
  })
  @ApiResponse({
    status: 409,
    description:
      'Identité déjà vérifiée — le dépôt manuel est un recours, pas un ' +
      'second chemin',
  })
  @Post('me/piece-identite')
  @UseInterceptors(INTERCEPTEUR_DES_FACES)
  deposerMaPieceIdentite(
    @CurrentUser() user: ActiveUser,
    @UploadedFiles() fichiers: FacesDeposees,
    @Body() dto: DeposerPieceIdentiteDto,
  ) {
    const recto = fichiers?.recto?.[0];
    if (!recto) throw new BadRequestException('Le recto est manquant.');

    const verso = fichiers?.verso?.[0];

    return this.deposerPieceIdentite.execute(user.userId, {
      type: dto.type,
      recto: face(recto),
      // `null` et non `undefined` : le domaine oppose « aucun verso » à
      // « verso exigé », et c'est lui qui refuse le dépôt incohérent.
      verso: verso ? face(verso) : null,
    });
  }

  @ApiOperation({
    summary: 'Décision manuelle sur un dossier KYC en revue (admin)',
    description:
      'Le KYC est validé automatiquement par Stripe Identity. Cette route ' +
      "n'agit que sur les dossiers passés en revue manuelle (EN_REVUE) suite " +
      'à un échec de la vérification automatique — un dossier auto-validé ' +
      "ou pas encore soumis est en lecture seule pour l'admin (409).",
  })
  @ApiResponse({ status: 200, description: 'Statut KYC mis à jour' })
  @ApiResponse({
    status: 403,
    description: 'Réservé aux équipes admin / compliance',
  })
  @ApiResponse({ status: 404, description: 'KYC introuvable' })
  @ApiResponse({
    status: 409,
    description: 'Dossier pas en revue manuelle — décision manuelle impossible',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:validate')
  @Patch(':userId/status')
  async patchKycStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateKycStatusDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    // La seule chose que la présentation garde de cette route : vérifier qui
    // appelle. Le reste — dossier réservé aux revues manuelles, écriture du
    // statut, annonce au titulaire et trace d'audit — appartient au use case et
    // à ses abonnés (§12.5).
    await this.assertKycReviewer(currentUser);

    return this.decideKycManualReview.execute({
      utilisateurId: userId,
      decision: dto.status,
      motifRefus: dto.motifRefus,
      decidePar: currentUser.userId,
    });
  }

  // ─── Session de vérification (Stripe Identity) ────────────────────────────

  @ApiOperation({ summary: 'Démarrer une session KYC Stripe Identity' })
  @ApiResponse({
    status: 201,
    description: 'Session KYC créée — rediriger vers url',
  })
  @Post('start')
  startKyc(@CurrentUser() user: ActiveUser) {
    return this.startKycSession.execute(user.userId, user.email);
  }

  @ApiOperation({ summary: "Consulter le statut d'une session KYC" })
  @ApiParam({
    name: 'sessionId',
    description: 'ID de la session Stripe Identity (vs_xxx)',
  })
  @ApiResponse({ status: 200, description: 'Statut de la session KYC' })
  @Get('session/:sessionId')
  getKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.consultKycSession.consulter(sessionId, this.demandeur(user));
  }

  @ApiOperation({
    summary:
      'Relire ma vérification chez le fournisseur et appliquer le verdict',
    description:
      "Va chercher l'état de la session chez Stripe Identity et l'applique au " +
      'dossier, sans attendre le webhook. Utile quand la plateforme n’est pas ' +
      'joignable depuis l’extérieur (poste de développement) ou après une ' +
      'livraison d’événement échouée. Le verdict lu passe par les mêmes ' +
      'transitions que celui d’un webhook : une décision manuelle déjà prise ' +
      'par la conformité l’écarte.',
  })
  @ApiResponse({ status: 200, description: 'État lu et suite donnée' })
  @HttpCode(HttpStatus.OK)
  @Post('me/synchroniser')
  synchroniserMaVerification(@CurrentUser() user: ActiveUser) {
    return this.synchroniserLaVerification.execute(user.userId);
  }

  @ApiOperation({
    summary: 'Relire la vérification d’un titulaire (admin)',
    description:
      'Même réconciliation, pour un dossier tiers — réservée aux équipes ' +
      'conformité.',
  })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({ status: 200, description: 'État lu et suite donnée' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @HttpCode(HttpStatus.OK)
  @Post(':userId/synchroniser')
  async synchroniserLaVerificationDe(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.assertKycReviewer(currentUser);
    return this.synchroniserLaVerification.execute(userId);
  }

  @ApiOperation({ summary: 'Annuler une session KYC' })
  @ApiParam({
    name: 'sessionId',
    description: 'ID de la session Stripe Identity (vs_xxx)',
  })
  @ApiResponse({ status: 204, description: 'Session annulée' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('session/:sessionId/cancel')
  cancelKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.consultKycSession.annuler(sessionId, this.demandeur(user));
  }

  // ─── Pièces déposées ──────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      "Obtenir les images KYC de l'utilisateur courant (URLs signées Stripe, 1h)",
  })
  @ApiResponse({
    status: 200,
    description: 'URLs signées ou null si pas de KYC validé',
  })
  @Get('images/me')
  getMyKycImages(@CurrentUser() user: ActiveUser) {
    return this.getKycImages.execute(user.userId);
  }

  @ApiOperation({ summary: "Obtenir les images KYC d'un utilisateur (admin)" })
  @ApiParam({ name: 'userId', description: "ID numérique de l'utilisateur" })
  @ApiResponse({
    status: 200,
    description: 'URLs signées ou null si pas de KYC validé',
  })
  @RequirePermission('kyc:validate')
  @Get('images/:userId')
  getKycImagesForUser(@Param('userId') userId: string) {
    const uid = parseInt(userId, 10);
    if (isNaN(uid)) throw new BadRequestException('userId invalide');
    return this.getKycImages.execute(uid);
  }

  /**
   * Traduit la permission de l'appelant en la seule chose dont le use case a
   * besoin : peut-il regarder un dossier qui n'est pas le sien ?
   */
  private demandeur(user: ActiveUser) {
    return {
      utilisateurId: user.userId,
      peutConsulterToutDossier: hasPermission(user.role, 'kyc:validate'),
    };
  }
}
