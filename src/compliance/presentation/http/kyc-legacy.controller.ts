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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { CreateKycUseCase } from 'src/compliance/application/usecases/kyc/create-kyc.usecase';
import { GetKycUseCase } from 'src/compliance/application/usecases/kyc/get-kyc.usecase';
import { GetKycImagesUseCase } from 'src/compliance/application/usecases/kyc/get-kyc-images.usecase';
import { RequestKycManualReviewUseCase } from 'src/compliance/application/usecases/kyc/request-kyc-manual-review.usecase';
import { DecideKycManualReviewUseCase } from 'src/compliance/application/usecases/kyc/decide-kyc-manual-review.usecase';
import { StartKycSessionUseCase } from 'src/compliance/application/usecases/kyc/start-kyc-session.usecase';
import { ConsultKycSessionUseCase } from 'src/compliance/application/usecases/kyc/consult-kyc-session.usecase';
import { UpdateKycStatusDto } from './dto/kyc.dto';

/** Rôles détenant `kyc:validate` — Compliance (+ super_admin via wildcard). */
const KYC_REVIEWER_ROLES: string[] = rolesWithPermission('kyc:validate');

/**
 * Compatibilité : les URLs KYC d'avant le découpage.
 *
 * Le KYC était réparti entre deux contextes, et ses routes portaient donc deux
 * préfixes qui ne parlaient pas de lui — `/profiles/kyc/*` pour le dossier,
 * `/payments/kyc/*` pour la session Stripe Identity. {@link KycController} les
 * publie désormais sous `/kyc`. Ce fichier garde les anciennes vivantes le
 * temps que le front migre.
 *
 * **Il est fait pour être supprimé d'un seul geste** : aucune logique ne lui est
 * propre, chaque méthode délègue au même use case que sa jumelle de
 * `KycController`. C'est pourquoi les corps sont dupliqués plutôt que factorisés
 * — un shim qu'on partage devient un shim qu'on n'ose plus retirer.
 *
 * Les deux préfixes cohabitent avec `ProfileController` et `PaymentController`,
 * qui gardent les leurs : Nest accepte plusieurs contrôleurs sur un même
 * préfixe tant que les chemins complets ne se recouvrent pas.
 *
 * @deprecated Utiliser les routes `/kyc/*`.
 */
@ApiTags('KYC (deprecated URLs)')
@ApiBearerAuth()
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class KycLegacyProfilesController {
  constructor(
    private readonly createKyc: CreateKycUseCase,
    private readonly getKyc: GetKycUseCase,
    private readonly requestKycManualReview: RequestKycManualReviewUseCase,
    private readonly decideKycManualReview: DecideKycManualReviewUseCase,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  private async assertKycReviewer(user: ActiveUser): Promise<void> {
    const compte = await this.userRepository.findById(user.userId);
    if (!compte || !KYC_REVIEWER_ROLES.includes(compte.role)) {
      throw new ForbiddenException(
        'Action réservée aux équipes admin / compliance.',
      );
    }
  }

  /** @deprecated `POST /kyc/me` */
  @ApiOperation({ deprecated: true, summary: 'Déprécié — voir POST /kyc/me' })
  @Post('kyc/me')
  initKyc(@CurrentUser() user: ActiveUser) {
    return this.createKyc.execute(user.userId);
  }

  /** @deprecated `GET /kyc/me` */
  @ApiOperation({ deprecated: true, summary: 'Déprécié — voir GET /kyc/me' })
  @Get('kyc/me')
  getMyKyc(@CurrentUser() user: ActiveUser) {
    return this.getKyc.execute(user.userId);
  }

  /** @deprecated `GET /kyc/all` */
  @ApiOperation({ deprecated: true, summary: 'Déprécié — voir GET /kyc/all' })
  @RequirePermission('kyc:validate')
  @Get('kyc/all')
  listAllKyc(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.getKyc.executeAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /** @deprecated `POST /kyc/me/manual-review` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir POST /kyc/me/manual-review',
  })
  @HttpCode(HttpStatus.OK)
  @Post('kyc/me/manual-review')
  requestManualReview(@CurrentUser() user: ActiveUser) {
    return this.requestKycManualReview.execute(user.userId);
  }

  /** @deprecated `PATCH /kyc/:userId/status` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir PATCH /kyc/{userId}/status',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('kyc:validate')
  @Patch(':userId/kyc/status')
  async patchKycStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateKycStatusDto,
    @CurrentUser() currentUser: ActiveUser,
  ) {
    await this.assertKycReviewer(currentUser);

    return this.decideKycManualReview.execute({
      utilisateurId: userId,
      decision: dto.status,
      motifRefus: dto.motifRefus,
      decidePar: currentUser.userId,
    });
  }
}

/**
 * Second volet du shim : les routes KYC servies jusqu'ici par
 * `PaymentController`.
 *
 * @deprecated Utiliser les routes `/kyc/*`.
 */
@ApiTags('KYC (deprecated URLs)')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class KycLegacyPaymentsController {
  constructor(
    private readonly getKycImages: GetKycImagesUseCase,
    private readonly startKycSession: StartKycSessionUseCase,
    private readonly consultKycSession: ConsultKycSessionUseCase,
  ) {}

  /** @deprecated `POST /kyc/start` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir POST /kyc/start',
  })
  @Post('kyc/start')
  startKyc(@CurrentUser() user: ActiveUser) {
    return this.startKycSession.execute(user.userId, user.email);
  }

  /** @deprecated `GET /kyc/images/me` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir GET /kyc/images/me',
  })
  @Get('kyc/images/me')
  getMyKycImages(@CurrentUser() user: ActiveUser) {
    return this.getKycImages.execute(user.userId);
  }

  /** @deprecated `GET /kyc/images/:userId` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir GET /kyc/images/{userId}',
  })
  @RequirePermission('kyc:validate')
  @Get('kyc/images/:userId')
  getKycImagesForUser(@Param('userId') userId: string) {
    const uid = parseInt(userId, 10);
    if (isNaN(uid)) throw new BadRequestException('userId invalide');
    return this.getKycImages.execute(uid);
  }

  /** @deprecated `GET /kyc/session/:sessionId` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir GET /kyc/session/{sessionId}',
  })
  @Get('kyc/session/:sessionId')
  getKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.consultKycSession.consulter(sessionId, {
      utilisateurId: user.userId,
      peutConsulterToutDossier: hasPermission(user.role, 'kyc:validate'),
    });
  }

  /** @deprecated `POST /kyc/session/:sessionId/cancel` */
  @ApiOperation({
    deprecated: true,
    summary: 'Déprécié — voir POST /kyc/session/{sessionId}/cancel',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('kyc/session/:sessionId/cancel')
  cancelKycSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.consultKycSession.annuler(sessionId, {
      utilisateurId: user.userId,
      peutConsulterToutDossier: hasPermission(user.role, 'kyc:validate'),
    });
  }
}
