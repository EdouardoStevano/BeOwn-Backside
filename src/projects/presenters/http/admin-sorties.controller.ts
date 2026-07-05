import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { DeclareSortieUseCase } from '../../applications/usecases/declare-sortie.usecase';
import { ExecuteSortieUseCase } from '../../applications/usecases/execute-sortie.usecase';
import {
  SORTIE_PROJET_REPOSITORY,
  type SortieProjetRepository,
} from '../../applications/ports/repositories/sortie-projet.repository';
import { StatutSortie } from '../../domains/sortie-projet';
import { DeclareSortieDto, MarkSortieActeeDto } from '../dto/sortie.dto';

@ApiTags('Admin — Sorties projet')
@ApiBearerAuth()
@Controller('admin/sorties')
@UseGuards(JwtAuthGuard)
@RequirePermission('sorties:execute')
export class AdminSortiesController {
  constructor(
    private readonly declareUseCase: DeclareSortieUseCase,
    private readonly executeUseCase: ExecuteSortieUseCase,
    @Inject(SORTIE_PROJET_REPOSITORY)
    private readonly sortieRepo: SortieProjetRepository,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      "Déclarer une sortie de projet (PROJETEE si pas d'acte, ACTEE si acte fourni)",
  })
  declare(@Body() dto: DeclareSortieDto) {
    return this.declareUseCase.execute({
      projetId: dto.projetId,
      prixRevente: dto.prixRevente,
      dateRevente: new Date(dto.dateRevente),
      acteVentePdfUrl: dto.acteVentePdfUrl ?? null,
    });
  }

  @Get('pending')
  @ApiOperation({ summary: 'Sorties projetées (sans acte de vente)' })
  listProjetees() {
    return this.sortieRepo.findByStatut(StatutSortie.PROJETEE);
  }

  @Get('actees')
  @ApiOperation({ summary: 'Sorties actées (prêtes à exécuter)' })
  listActees() {
    return this.sortieRepo.findByStatut(StatutSortie.ACTEE);
  }

  @Get('projet/:projetId')
  @ApiOperation({ summary: "Historique des sorties d'un projet" })
  historique(@Param('projetId') projetId: string) {
    return this.sortieRepo.findByProjet(projetId);
  }

  @Post(':id/mark-actee')
  @ApiOperation({
    summary: 'Marquer une sortie comme actée (upload acte de vente)',
  })
  async markActee(
    @Param('id') id: string,
    @Body() dto: MarkSortieActeeDto,
  ) {
    const s = await this.sortieRepo.findById(id);
    if (!s) throw new BadRequestException('Sortie introuvable.');
    if (s.statut !== StatutSortie.PROJETEE) {
      throw new BadRequestException(
        `Statut actuel "${s.statut}" — seul PROJETEE peut être marqué ACTEE.`,
      );
    }
    s.statut = StatutSortie.ACTEE;
    s.acteVentePdfUrl = dto.acteVentePdfUrl;
    return this.sortieRepo.save(s);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Annuler une sortie (uniquement avant DISTRIBUEE)',
  })
  async cancel(@Param('id') id: string) {
    const s = await this.sortieRepo.findById(id);
    if (!s) throw new BadRequestException('Sortie introuvable.');
    if (s.statut === StatutSortie.DISTRIBUEE) {
      throw new BadRequestException(
        'Sortie déjà distribuée, annulation impossible.',
      );
    }
    s.statut = StatutSortie.ANNULEE;
    return this.sortieRepo.save(s);
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Exécuter la sortie : rembourser capital + distribuer plus-value, clôturer le projet',
  })
  execute(@Param('id') id: string, @CurrentUser() user: ActiveUser) {
    return this.executeUseCase.execute(id, user.userId);
  }
}
