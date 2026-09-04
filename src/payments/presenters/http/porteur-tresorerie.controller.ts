import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { PorteurAccessGuard } from 'src/common/auth/porteur-access.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { GetPorteurTresorerieUseCase } from '../../applications/usecases/get-porteur-tresorerie.usecase';
import { TresoreriePaginationDto } from '../dto/porteur-tresorerie.dto';

/**
 * Trésorerie d'un projet, exposée à SON porteur.
 *
 * Elle vit dans le module `payments`, à côté des écritures qu'elle donne à
 * voir (versements Stripe, apports par carte) : c'est ici que réside la
 * connaissance de leurs types et metadata, pas dans `locative-management`.
 *
 * Même patron de sécurité que le contrôleur porteur de la gestion locative :
 * accès à l'espace porteur exigé (`PorteurAccessGuard`, relu EN BASE) ET
 * appartenance du projet vérifiée par ressource — un porteur authentifié ne
 * lit JAMAIS la trésorerie du projet d'un autre (anti-IDOR, tranché dans le
 * cas d'usage avant toute lecture financière).
 *
 * `@Roles(UserRole.PORTEUR)` a été remplacé par ce garde au lot 4 (décision
 * fondateur D1) : un investisseur dont la demande d'accès porteur a été
 * acceptée conserve son rôle et accède ici aussi. Le contrôle par ressource,
 * lui, est inchangé.
 */
@ApiTags('Porteur — Trésorerie')
@ApiBearerAuth()
@Controller('porteur')
@UseGuards(JwtAuthGuard, PorteurAccessGuard)
export class PorteurTresorerieController {
  constructor(private readonly getTresorerie: GetPorteurTresorerieUseCase) {}

  @ApiOperation({
    summary: "Trésorerie d'un projet du porteur connecté",
    description:
      'Solde du portefeuille technique du projet, versements reçus du projet ' +
      '(Stripe et virements constatés) et apports effectués par le porteur. ' +
      "`wallet` est null tant qu'aucun mouvement n'a atteint le projet.",
  })
  @ApiParam({ name: 'id', description: 'UUID du projet' })
  @ApiResponse({ status: 200, description: 'Trésorerie du projet' })
  @ApiResponse({ status: 403, description: "Projet porté par quelqu'un d'autre" })
  @ApiResponse({ status: 404, description: 'Projet introuvable' })
  @Get('projects/:id/tresorerie')
  async tresorerie(
    @Param('id', ParseUUIDPipe) projetId: string,
    @Query() pagination: TresoreriePaginationDto,
    @CurrentUser() user: ActiveUser,
  ) {
    return this.getTresorerie.execute({
      projetId,
      porteurUserId: user.userId,
      limit: pagination.limit,
      offset: pagination.offset,
    });
  }
}
