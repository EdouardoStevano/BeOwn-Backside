import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { DeclareSortieUseCase } from 'src/projects/applications/usecases/sortie/declare-sortie.usecase';
import { ExecuteSortieUseCase } from 'src/projects/applications/usecases/sortie/execute-sortie.usecase';
import { ManageSortieUseCase } from 'src/projects/applications/usecases/sortie/manage-sortie.usecase';
import { StatutSortie } from 'src/projects/domains/enums/statut-sortie.enum';
import { DeclareSortieDto, MarkSortieActeeDto } from '../dto/sortie.dto';

/**
 * Sorties de projet (revente du bien), côté administration.
 *
 * Le contrôleur portait le cycle de vie de la sortie : il chargeait l'agrégat
 * par un repository qu'il injectait directement (§12.9), vérifiait le statut
 * courant par un `if`, écrivait `s.statut = …` puis rappelait le repository
 * (§12.5). Les transitions sont revenues à l'agrégat `SortieProjet` et
 * l'orchestration à `ManageSortieUseCase` ; il ne reste ici que le routage.
 */
@ApiTags('Admin — Sorties projet')
@ApiBearerAuth()
@Controller('admin/sorties')
@UseGuards(JwtAuthGuard)
@RequirePermission('sorties:execute')
export class AdminSortiesController {
  constructor(
    private readonly declareSortie: DeclareSortieUseCase,
    private readonly manageSortie: ManageSortieUseCase,
    private readonly executeSortie: ExecuteSortieUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      "Déclarer une sortie de projet (PROJETEE si pas d'acte, ACTEE si acte fourni)",
  })
  declare(@Body() dto: DeclareSortieDto) {
    return this.declareSortie.execute({
      projetId: dto.projetId,
      prixRevente: dto.prixRevente,
      dateRevente: new Date(dto.dateRevente),
      acteVentePdfUrl: dto.acteVentePdfUrl ?? null,
    });
  }

  @Get('pending')
  @ApiOperation({ summary: 'Sorties projetées (sans acte de vente)' })
  listProjetees() {
    return this.manageSortie.listerParStatut(StatutSortie.PROJETEE);
  }

  @Get('actees')
  @ApiOperation({ summary: 'Sorties actées (prêtes à exécuter)' })
  listActees() {
    return this.manageSortie.listerParStatut(StatutSortie.ACTEE);
  }

  @Get('projet/:projetId')
  @ApiOperation({ summary: "Historique des sorties d'un projet" })
  historique(@Param('projetId') projetId: string) {
    return this.manageSortie.listerParProjet(projetId);
  }

  @Post(':id/mark-actee')
  @ApiOperation({
    summary: 'Marquer une sortie comme actée (upload acte de vente)',
  })
  markActee(@Param('id') id: string, @Body() dto: MarkSortieActeeDto) {
    return this.manageSortie.marquerActee(id, dto.acteVentePdfUrl);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler une sortie (uniquement avant DISTRIBUEE)' })
  cancel(@Param('id') id: string) {
    return this.manageSortie.annuler(id);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Exécuter la sortie : rembourser capital + distribuer plus-value, clôturer le projet',
  })
  execute(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.executeSortie.execute(id, user.userId, user.role);
  }
}
