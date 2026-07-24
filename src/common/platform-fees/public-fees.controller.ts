import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { PlatformFeesService } from './platform-fees.service';

/**
 * Endpoint public exposant les taux de frais plateforme courants.
 *
 * Consommé par le Frontside (FAQ, simulateurs) pour éviter toute
 * contradiction entre les pourcentages affichés et ceux réellement
 * appliqués (configurables par le super_admin — voir PlatformFeesService).
 */
@ApiTags('Public — Frais plateforme')
@Controller('public/platform-fees')
export class PublicFeesController {
  constructor(private readonly platformFees: PlatformFeesService) {}

  @ApiOperation({ summary: 'Taux de frais courants de la plateforme (public)' })
  @Public()
  @Get()
  getFees() {
    return this.platformFees.getRates();
  }
}
