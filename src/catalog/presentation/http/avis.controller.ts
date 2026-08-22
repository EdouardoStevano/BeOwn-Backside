import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/iam/presentation/guards/jwt-auth.guard';
import { Public } from 'src/iam/presentation/decorators/public.decorator';
import { CurrentUser } from 'src/iam/presentation/decorators/current-user.decorator';
import type { ActiveUser } from 'src/iam/presentation/decorators/current-user.decorator';
import { Inject } from '@nestjs/common';
import { AVIS_REPOSITORY } from 'src/catalog/domain/repositories/avis.repository';
import type { AvisRepository } from 'src/catalog/domain/repositories/avis.repository';
import { Avis } from 'src/catalog/domain/aggregates/avis';
import { CreateAvisDto } from './dto/avis.dto';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@ApiTags('Avis')
@ApiBearerAuth()
@Controller('avis')
@UseGuards(JwtAuthGuard)
export class AvisController {
  constructor(
    @Inject(AVIS_REPOSITORY)
    private readonly avisRepository: AvisRepository,
  ) {}

  @ApiOperation({ summary: 'Soumettre un avis sur un projet' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 201, description: 'Avis enregistré' })
  @ApiResponse({ status: 409, description: 'Avis déjà soumis pour ce projet' })
  @Post('projet/:projetId')
  async create(
    @Param('projetId') projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const existing = await this.avisRepository.findByUserAndProjet(user.userId, projetId);
    if (existing) {
      throw new ConflictException('Vous avez déjà soumis un avis pour ce projet.');
    }

    const avis = new Avis();
    avis.projetId = projetId;
    avis.userId = user.userId;
    avis.note = dto.note;
    avis.commentaire = dto.commentaire ?? null;

    return this.avisRepository.save(avis);
  }

  @ApiOperation({ summary: "Mettre à jour son avis sur un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis mis à jour' })
  @Post('projet/:projetId/update')
  async update(
    @Param('projetId') projetId: string,
    @Body() dto: CreateAvisDto,
    @CurrentUser() user: ActiveUser,
  ) {
    const existing = await this.avisRepository.findByUserAndProjet(user.userId, projetId);
    if (!existing) {
      throw new NotFoundException("Aucun avis trouvé. Utilisez POST /avis/projet/:projetId pour en créer un.");
    }

    existing.note = dto.note;
    existing.commentaire = dto.commentaire ?? null;

    return this.avisRepository.save(existing);
  }

  @ApiOperation({ summary: "Avis de l'utilisateur sur un projet" })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Avis de cet utilisateur ou null' })
  @Get('projet/:projetId/me')
  async getMyAvis(
    @Param('projetId') projetId: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.avisRepository.findByUserAndProjet(user.userId, projetId);
  }

  @ApiOperation({ summary: 'Liste des avis d\'un projet (accès public)' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Liste des avis' })
  @Public()
  @Get('projet/:projetId')
  getByProjet(@Param('projetId') projetId: string) {
    return this.avisRepository.findByProjetId(projetId);
  }

  @ApiOperation({ summary: 'Statistiques des avis d\'un projet (accès public)' })
  @ApiParam({ name: 'projetId', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Note moyenne et nombre d\'avis' })
  @Public()
  @Get('projet/:projetId/stats')
  getStats(@Param('projetId') projetId: string) {
    return this.avisRepository.getStats(projetId);
  }
}
