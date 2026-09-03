import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from 'src/iam/presentation/decorators/require-permission.decorator';
import { GererBlocsDeContenuUseCase } from 'src/catalog/application/usecases/project/gerer-blocs-de-contenu.usecase';
import {
  CreerBlocDeContenuDto,
  DeplacerDto,
  ModifierBlocDeContenuDto,
  ReordonnerBlocsDto,
} from './dto/contenu-projet.dto';
import { ApiFicheProjet } from './fiche-projet.response';

/**
 * Les pavés éditoriaux d'une fiche projet — « autant de blocs que
 * l'administrateur le souhaite », chacun avec son titre, son rang et son champ
 * de texte enrichi.
 *
 * **Cinq routes plutôt qu'un champ de `PATCH /projects/:id`**, et c'est le même
 * raisonnement qui a sorti le statut du DTO de mise à jour : un tableau posé
 * d'un bloc laisse écrire deux blocs au même rang, ou en effacer douze par
 * omission. Chaque route nomme un geste, et chacun repasse par l'invariant de
 * position de la suite (§4, §38.4).
 *
 * Toutes rendent le **projet entier** — donc la fiche à jour, blocs compris —
 * plutôt que le seul bloc touché : c'est ce dont le back-office a besoin après
 * un glisser-déposer, et cela évite une seconde requête pour relire des
 * positions que l'opération vient de décaler.
 *
 * Les erreurs métier remontent telles quelles ; `CatalogErrorFilter` les traduit.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects/:projectId/blocs')
export class ProjectBlocsController {
  constructor(private readonly blocs: GererBlocsDeContenuUseCase) {}

  @ApiOperation({
    summary: 'Ajouter un bloc de contenu à la fiche (admin)',
    description:
      'Le bloc se pose en dernier, ou au rang demandé — les suivants reculent alors d’un cran.',
  })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiFicheProjet('Projet avec sa fiche à jour', 201)
  @ApiResponse({
    status: 400,
    description:
      'Titre vide ou de plus de 200 caractères (`TITRE_DE_BLOC_REQUIS`), corps vide (`CORPS_DE_BLOC_REQUIS`), ou position hors de 0…n (`POSITION_DE_BLOC_INVALIDE`)',
  })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @RequirePermission('projects:manage')
  @Post()
  ajouter(
    @Param('projectId') projectId: string,
    @Body() dto: CreerBlocDeContenuDto,
  ) {
    return this.blocs.ajouter(
      projectId,
      { titre: dto.titre, corps: dto.corps },
      dto.position,
    );
  }

  @ApiOperation({ summary: "Réordonner tous les blocs d'une fiche (admin)" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiFicheProjet('Projet avec sa fiche à jour')
  @ApiResponse({
    status: 400,
    description:
      '`REORDONNANCEMENT_INCOMPLET` — la liste ne cite pas exactement les blocs de la fiche, une fois chacun. Une liste partielle est refusée plutôt que complétée : la compléter ferait disparaître silencieusement un pavé.',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  // Déclarée avant `:blocId`, sinon Nest résout « reordonner » comme un
  // identifiant de bloc — même précaution que `spv/list` dans ProjectController.
  @Patch('reordonner')
  reordonner(
    @Param('projectId') projectId: string,
    @Body() dto: ReordonnerBlocsDto,
  ) {
    return this.blocs.reordonner(projectId, dto.blocIds);
  }

  @ApiOperation({ summary: "Réécrire le titre ou le texte d'un bloc (admin)" })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'blocId', description: 'UUID du bloc' })
  @ApiFicheProjet('Projet avec sa fiche à jour')
  @ApiResponse({
    status: 404,
    description:
      'Projet introuvable, ou bloc absent de cette fiche (`BLOC_DE_CONTENU_INTROUVABLE`)',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':blocId')
  modifier(
    @Param('projectId') projectId: string,
    @Param('blocId') blocId: string,
    @Body() dto: ModifierBlocDeContenuDto,
  ) {
    return this.blocs.modifier(projectId, blocId, dto);
  }

  @ApiOperation({ summary: 'Déplacer un bloc à un autre rang (admin)' })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'blocId', description: 'UUID du bloc' })
  @ApiFicheProjet(
    'Projet avec sa fiche à jour — les blocs enjambés sont renumérotés',
  )
  @ApiResponse({
    status: 400,
    description:
      '`POSITION_DE_BLOC_INVALIDE` — au déplacement, la position doit tenir entre 0 et n-1 (on se glisse entre des blocs existants)',
  })
  @ApiResponse({ status: 404, description: 'Projet ou bloc introuvable' })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Patch(':blocId/position')
  deplacer(
    @Param('projectId') projectId: string,
    @Param('blocId') blocId: string,
    @Body() dto: DeplacerDto,
  ) {
    return this.blocs.deplacer(projectId, blocId, dto.position);
  }

  @ApiOperation({ summary: 'Retirer un bloc de la fiche (admin)' })
  @ApiParam({ name: 'projectId', description: 'UUID du projet' })
  @ApiParam({ name: 'blocId', description: 'UUID du bloc' })
  @ApiFicheProjet(
    'Projet avec sa fiche à jour — les blocs suivants se resserrent',
  )
  @ApiResponse({
    status: 404,
    description:
      'Projet introuvable, ou bloc absent de cette fiche (`BLOC_DE_CONTENU_INTROUVABLE`)',
  })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:manage')
  @Delete(':blocId')
  retirer(
    @Param('projectId') projectId: string,
    @Param('blocId') blocId: string,
  ) {
    return this.blocs.retirer(projectId, blocId);
  }
}
