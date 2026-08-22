import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { rolesWithPermission } from 'src/iam/domain/policies/role-permissions.policy';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domain/enums/user.enum';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { AnnulerOrdreParAdministrationUseCase } from 'src/secondary-market/application/usecases/annuler-ordre-par-administration.usecase';
import { ForcerExecutionOrdreUseCase } from 'src/secondary-market/application/usecases/forcer-execution-ordre.usecase';

const ADMIN_ROLES: string[] = rolesWithPermission('market:manage');

/**
 * Les écrans du back-office sur le carnet d'ordres.
 *
 * Ils vivaient dans `src/admin/`, et y écrivaient l'état métier : six
 * `Repository<Entity>`, un `DataSource`, et deux transactions de règlement
 * écrites à même le contrôleur — 558 lignes. §3.3 est explicite : le
 * back-office « n'implémente que du RBAC et de la composition d'écrans », la
 * logique restant dans les contextes. C'est donc ici, dans `secondary-market`,
 * que la reprise en main d'un ordre est publiée.
 *
 * Le contrôleur ne garde que ce que §3.3 lui laisse : la garde de rôle, la
 * lecture du carnet — un read model (§11), avec ses jointures pour l'écran —
 * et l'appel aux deux use cases.
 */
@ApiTags('Admin — Marché secondaire')
@ApiBearerAuth()
@Controller('admin/secondary-market')
@UseGuards(JwtAuthGuard)
@RequirePermission('market:manage')
export class AdminSecondaryMarketController {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly annulerParAdministration: AnnulerOrdreParAdministrationUseCase,
    private readonly forcerExecution: ForcerExecutionOrdreUseCase,
  ) {}

  private async assertAdmin(user: ActiveUser): Promise<void> {
    const compte = await this.userRepo.findOne({
      where: { userId: user.userId },
    });
    if (!compte || !ADMIN_ROLES.includes(compte.role as UserRole)) {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
  }

  @Get('orders')
  @ApiOperation({ summary: 'Lister tous les ordres du marché secondaire' })
  @ApiQuery({ name: 'statut', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listOrders(
    @CurrentUser() user: ActiveUser,
    @Query('statut') statut?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    await this.assertAdmin(user);

    const skip = (Number(page) - 1) * Number(limit);

    const qb = this.ordreRepo
      .createQueryBuilder('ord')
      .leftJoinAndSelect('ord.investissement', 'inv')
      .leftJoinAndSelect('inv.projet', 'p')
      .leftJoinAndSelect('ord.vendeur', 'vendeur')
      .leftJoinAndMapOne(
        'ord.acheteur',
        UserEntity,
        'acheteur',
        'acheteur."userId" = ord."acheteurId"',
      )
      .orderBy('ord.createdAt', 'DESC')
      .skip(skip)
      .take(Number(limit));

    if (statut) qb.andWhere('ord.statut = :statut', { statut });

    const [orders, total] = await qb.getManyAndCount();

    return { data: orders, total, page: Number(page), limit: Number(limit) };
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Annuler un ordre (admin) — reverse complète si déjà exécuté',
  })
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user);
    return this.annulerParAdministration.execute(id);
  }

  @Post('orders/:id/force-execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Forcer l'exécution d'un ordre MATCH_PROPOSE (admin)",
  })
  async forceExecute(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    await this.assertAdmin(user);
    return this.forcerExecution.execute(id);
  }
}
