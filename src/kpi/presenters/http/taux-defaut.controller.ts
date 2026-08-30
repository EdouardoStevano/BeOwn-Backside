import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { TauxDefautPublicationService } from 'src/kpi/applications/taux-defaut-publication.service';

/**
 * Publication des taux de défaut — art. 20 du règlement (UE) 2020/1503.
 *
 * La route est publique à dessein : l'article impose une publication
 * accessible, et une statistique de défaut réservée aux clients connectés
 * n'en serait pas une.
 */
@ApiTags('Statistiques réglementaires')
@Controller('statistiques')
export class TauxDefautController {
  constructor(private readonly publication: TauxDefautPublicationService) {}

  @ApiOperation({
    summary:
      'Taux de défaut des projets sur les trente-six derniers mois (publication volontaire)',
  })
  @ApiResponse({
    status: 200,
    description: 'Cohortes annuelles, agrégat global et méthodologie de calcul',
  })
  @Public()
  @Get('taux-de-defaut')
  async tauxDeDefaut() {
    return this.publication.publier();
  }
}
