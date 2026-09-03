import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { CreateSpvUseCase } from 'src/catalog/application/usecases/spv/create-spv.usecase';
import { ListSpvUseCase } from 'src/catalog/application/usecases/spv/list-spv.usecase';
import { CreateSpvDto } from './dto/spv.dto';

/**
 * Les sociétés de projet.
 *
 * `Spv` est un agrégat à part entière du contexte `catalog` (§3.2), que
 * `RealEstateProject` référence sans le contenir : il a son propre cycle de vie
 * — une SPV se constitue avant le projet qu'elle portera, et lui survit le
 * temps de la liquidation. Ses deux routes vivaient pourtant dans
 * `ProjectController`, qui devait pour cela injecter deux use cases de plus et
 * déclarer `spv/list` avant `:id` pour que Nest ne prenne pas « spv » pour un
 * identifiant de projet. Un agrégat, un contrôleur : la précaution d'ordre
 * disparaît avec le voisinage qui l'imposait.
 *
 * **Les deux URL sont inchangées** — `POST /projects/spv` et
 * `GET /projects/spv/list`, tel que documenté sur `SpvSnapshot`. Ce découpage
 * est interne à la couche présentation ; il ne casse aucun client. Les
 * remonter à `/spv` serait plus juste côté REST, mais c'est une décision
 * d'API, pas de refactoring.
 *
 * Les erreurs métier remontent telles quelles : `CatalogErrorFilter` les
 * traduit en statuts HTTP.
 */
@ApiTags('SPV')
@ApiBearerAuth()
@Controller('projects/spv')
export class SpvController {
  constructor(
    private readonly createSpv: CreateSpvUseCase,
    private readonly listSpv: ListSpvUseCase,
  ) {}

  @ApiOperation({ summary: 'Créer une SPV' })
  @ApiResponse({ status: 201, description: 'SPV créée' })
  @RequirePermission('projects:manage', 'spv:manage')
  @Post()
  create(@Body() dto: CreateSpvDto) {
    return this.createSpv.execute(dto);
  }

  @ApiOperation({
    summary: 'Lister les SPV',
    description:
      "Réservé au back-office. La route n'exigeait aucune permission : la seule garde JWT globale la protégeait, et tout compte connecté — investisseur compris — pouvait donc lister les sociétés de projet, leur SIREN et leur capital social.",
  })
  @ApiResponse({ status: 200, description: 'Liste des sociétés de projet' })
  @RequirePermission('projects:read')
  @Get('list')
  list() {
    return this.listSpv.execute();
  }
}
