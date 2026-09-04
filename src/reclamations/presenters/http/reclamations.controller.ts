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
import { AuditSansCorps } from 'src/common/audit/audit-sans-corps.decorator';

/**
 * Réclamations — art. 27 du règlement (UE) 2020/1503.
 *
 * L'article impose non seulement de traiter les réclamations, mais de PUBLIER
 * la description de la procédure : d'où la route publique `/reclamations/procedure`.
 *
 * ## Régime d'accès
 *
 * Une réclamation contient l'identité d'un plaignant, le récit d'un litige et
 * la réponse de la plateforme. Deux catégories d'appelants seulement y ont
 * accès :
 *  - le DEMANDEUR, pour ses propres réclamations ;
 *  - les rôles portant `reclamations:manage`, pour les traiter.
 *
 * Aucune route ne raisonne « par exclusion » d'un rôle : c'est ce qui avait
 * ouvert la consultation à tout compte back-office, y compris ceux qui n'ont
 * rien à voir avec le traitement des réclamations. La décision appartient au
 * service, qui la prend sur la ressource chargée.
 */
@ApiTags('Réclamations')
// Texte libre de bout en bout : l'exposé du réclamant, l'instruction interne
// et la réponse. Rien de tout cela n'a vocation à vivre cinq ans dans
// `audit_log`, hors du barème de conservation des réclamations.
@AuditSansCorps()
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
  @ApiResponse({ status: 403, description: 'Rôle sans permission reclamations:manage' })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Get('back-office')
  async fileDeTraitement(
    @CurrentUser() user: ActiveUser,
    @Query('statut') statut?: StatutReclamation,
  ) {
    return this.reclamations.listerPourBackOffice(user, statut);
  }

  @ApiOperation({
    summary: 'Consulter une réclamation',
    description:
      "Réservée au demandeur de la réclamation et aux rôles portant la permission reclamations:manage.",
  })
  @ApiResponse({ status: 403, description: "Réclamation d'autrui, sans habilitation à la traiter" })
  @ApiResponse({ status: 404, description: 'Réclamation introuvable' })
  @Get(':id')
  async consulter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    // Le presenter transmet l'IDENTITÉ de l'appelant, jamais un droit :
    // l'habilitation se décide dans le service, sur la ressource chargée.
    return this.reclamations.consulter(id, user);
  }

  @ApiOperation({ summary: 'Prendre une réclamation en instruction' })
  @ApiResponse({ status: 403, description: 'Rôle sans permission reclamations:manage' })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Patch(':id/instruction')
  async prendreEnInstruction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.reclamations.prendreEnInstruction(id, user);
  }

  @ApiOperation({ summary: 'Répondre à une réclamation et la clore' })
  @ApiResponse({ status: 403, description: 'Rôle sans permission reclamations:manage' })
  @UseGuards(PermissionsGuard)
  @RequirePermission('reclamations:manage')
  @Patch(':id/reponse')
  async repondre(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUser,
    @Body() dto: RepondreReclamationDto,
  ) {
    return this.reclamations.repondre(id, user, dto);
  }
}
