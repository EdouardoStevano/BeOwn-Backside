import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { ConsultAvisProjetUseCase } from 'src/catalog/application/usecases/avis/consult-avis-projet.usecase';
import { DeposerAvisProjetUseCase } from 'src/catalog/application/usecases/avis/deposer-avis-projet.usecase';
import { CreateAvisDto } from './dto/avis.dto';

/**
 * Les avis, vus depuis un projet.
 *
 * Le contrôleur ne décide plus rien (§14). Il fabriquait l'agrégat à la main,
 * dupliquait la règle « un seul avis par compte » et servait les avis de
 * n'importe quel projet — y compris ceux qui ne sont pas publics, ce que la
 * route jumelle de `ProjectController` interdisait déjà. Les cinq routes sont
 * inchangées ; elles passent toutes par les use cases du contexte, donc par la
 * même garde d'éligibilité.
 */
@ApiTags('Avis')
@ApiBearerAuth()
@Controller('avis')
@UseGuards(JwtAuthGuard)
export class AvisController {
  constructor(
    private readonly consultAvis: ConsultAvisProjetUseCase,
    private readonly deposerAvis: DeposerAvisProjetUseCase,
  ) {}

  @ApiOperation({ summary: 'Soumettre un avis sur un projet' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 201, description: 'Avis enregistré' })
  @ApiResponse({ status: 400, description: 'Avis déjà soumis pour ce projet' })
  @ApiResponse({ status: 404, description: 'Projet introuvable ou non public' })
  @Post('projet/:projetId')
  async create(
    @Param('projetId') projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.deposerAvis.deposer({
      projetId,
      utilisateurId: user.userId,
      note: dto.note,
      commentaire: dto.commentaire,
    });
  }

  @ApiOperation({ summary: 'Mettre à jour son avis sur un projet' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis mis à jour' })
  @ApiResponse({ status: 404, description: 'Aucun avis déposé sur ce projet' })
  @Post('projet/:projetId/update')
  async update(
    @Param('projetId') projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.deposerAvis.modifier({
      projetId,
      utilisateurId: user.userId,
      note: dto.note,
      commentaire: dto.commentaire,
    });
  }

  @ApiOperation({ summary: "Avis de l'utilisateur sur un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis de cet utilisateur ou null' })
  @Get('projet/:projetId/me')
  async getMyAvis(
    @Param('projetId') projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.consultAvis.avisDuCompte(projetId, user.userId);
  }

  @ApiOperation({ summary: "Liste des avis d'un projet (accès public)" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des avis' })
  @Public()
  @Get('projet/:projetId')
  async getByProjet(@Param('projetId') projetId: string) {
    const { avis } = await this.consultAvis.lister(projetId);
    return avis;
  }

  @ApiOperation({ summary: "Statistiques des avis d'un projet (accès public)" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: "Note moyenne et nombre d'avis" })
  @Public()
  @Get('projet/:projetId/stats')
  async getStats(@Param('projetId') projetId: string) {
    return this.consultAvis.statistiques(projetId);
  }
}
