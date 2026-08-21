import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/auth/permissions.guard';
import { RequirePermission } from 'src/common/auth/require-permission.decorator';
import { Public } from 'src/common/auth/public.decorator';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { ReclamationsService } from 'src/reclamations/applications/reclamations.service';
import {
  CategorieReclamation,
  DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES,
  DELAI_REPONSE_MOIS,
  StatutReclamation,
  TRAITEMENT_GRATUIT,
} from 'src/reclamations/domains/reclamation';
import {
  CreateReclamationDto,
  RepondreReclamationDto,
} from '../dto/reclamation.dto';

/**
 * Réclamations — art. 27 du règlement (UE) 2020/1503.
 *
 * L'article impose non seulement de traiter les réclamations, mais de PUBLIER
 * la description de la procédure : d'où la route publique `/reclamations/procedure`.
 */
@ApiTags('Réclamations')
@Controller('reclamations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReclamationsController {
  constructor(private readonly reclamations: ReclamationsService) {}

  @ApiOperation({
    summary: 'Description publique de la procédure de traitement des réclamations',
  })
  @Public()
  @Get('procedure')
  procedure() {
    return {
      gratuite: TRAITEMENT_GRATUIT,
      delaiAccuseReceptionJoursOuvrables: DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES,
      delaiReponseMois: DELAI_REPONSE_MOIS,
      categories: Object.values(CategorieReclamation),
      etapes: [
        'Vous déposez votre réclamation depuis votre espace, gratuitement.',
        'Un accusé de réception vous est adressé immédiatement, avec une référence de suivi.',
        'Votre réclamation est instruite par une personne distincte de celle mise en cause.',
        'Une réponse motivée, en langage clair, vous est adressée sous deux mois au plus.',
      ],
      textesApplicables: [
        'Règlement (UE) 2020/1503, article 27',
        'Règlement délégué (UE) 2022/2117',
        'Instruction AMF DOC-2012-07',
      ],
    };
  }

  @ApiOperation({ summary: 'Déposer une réclamation' })
  @ApiResponse({ status: 201, description: 'Réclamation enregistrée et accusée réception' })
  @Post()
  async deposer(
    @CurrentUser() user: ActiveUser,
    @Body() dto: CreateReclamationDto,
  ) {
    return this.reclamations.deposer(user.userId, dto);
  }

  @ApiOperation({ summary: 'Lister mes réclamations' })
  @Get('mes-reclamations')
  async mesReclamations(@CurrentUser() user: ActiveUser) {
    return this.reclamations.listerPourUtilisateur(user.userId);
  }

  @ApiOperation({ summary: 'File de traitement des réclamations' })
  @ApiQuery({ name: 'statut', required: false, enum: StatutReclamation })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Get('back-office')
  async fileDeTraitement(@Query('statut') statut?: StatutReclamation) {
    return this.reclamations.listerPourBackOffice(statut);
  }

  @ApiOperation({ summary: 'Consulter une réclamation' })
  @Get(':id')
  async consulter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    const estBackOffice = Boolean(user.role && user.role !== 'investisseur');
    return this.reclamations.consulter(id, user.userId, estBackOffice);
  }

  @ApiOperation({ summary: 'Prendre une réclamation en instruction' })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Patch(':id/instruction')
  async prendreEnInstruction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.reclamations.prendreEnInstruction(id, user.userId);
  }

  @ApiOperation({ summary: 'Répondre à une réclamation et la clore' })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Patch(':id/reponse')
  async repondre(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
    @Body() dto: RepondreReclamationDto,
  ) {
    return this.reclamations.repondre(id, user.userId, dto);
  }
}
