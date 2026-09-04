import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { CurrentUser } from 'src/common/auth/current-user.decorator';
import type { ActiveUser } from 'src/common/auth/current-user.decorator';
import { PersonalDataExportService } from 'src/iam/applications/services/personal-data-export.service';

/**
 * Droits RGPD de l'utilisateur courant — art. 15 (accès) et 20 (portabilité).
 *
 * Contrôleur dédié (et non une route de plus dans `UserController`) : celui-ci
 * est `@SkipThrottle()` alors que l'export, coûteux (une dizaine de lectures
 * multi-tables), doit être resserré. Le palier `auth` est fail-open en
 * développement (Redis absent) et ne devient fail-closed qu'hors dev, après
 * échecs Redis répétés — voir `RedisThrottlerStorage`.
 *
 * SRP : aucune logique ici — l'agrégation vit dans `PersonalDataExportService`,
 * le contrôleur ne fait que l'identité (JWT), le throttle et les entêtes HTTP.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class PersonalDataController {
  constructor(
    private readonly personalDataExportService: PersonalDataExportService,
  ) {}

  @ApiOperation({
    summary: 'Exporter mes données personnelles (RGPD art. 15/20)',
  })
  @ApiResponse({
    status: 200,
    description:
      'JSON structuré téléchargeable (Content-Disposition: attachment) agrégeant, module par module, les données personnelles du compte courant — et uniquement les siennes.',
  })
  @ApiResponse({ status: 429, description: 'Trop de demandes — réessayez plus tard' })
  // Serré : un export par-ci par-là est légitime, une rafale est un scraping.
  @Throttle({ auth: { ttl: 3_600_000, limit: 5 } })
  @Get('donnees-personnelles')
  async exportPersonalData(
    @CurrentUser() user: ActiveUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Anti-IDOR : le SEUL identifiant qui atteint le service vient du JWT.
    const donnees = await this.personalDataExportService.export(user.userId);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="beown-donnees-personnelles-${date}.json"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return donnees;
  }
}
