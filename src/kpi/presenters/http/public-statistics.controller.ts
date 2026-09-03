import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { PublicStatisticsService } from '../../applications/public-statistics.service';

/**
 * Compteurs d'activité publics — la réassurance chiffrée de la vitrine.
 *
 * Contrat consommé par `stats.datasource.ts` du Frontside (convenu mission
 * benchmark 2026-09-02) : `{ misAJourLe, projetsFinances, projetsEnCollecte,
 * montantCollecteEur, loyersDistribuesEur, investisseursActifs,
 * tauxOccupationMoyenPct }`.
 *
 * Tous les chiffres sont des AGRÉGATS RÉELS relus de la base — le benchmark
 * concurrentiel a montré que des compteurs honnêtes et datés, même modestes,
 * valent mieux que zéro chiffre (et infiniment mieux qu'un chiffre inventé,
 * pratique déjà purgée deux fois de cette vitrine). AUCUNE PII : uniquement
 * des sommes et des comptes.
 */
@ApiTags('Public — Statistiques')
@Controller('public/statistics')
export class PublicStatisticsController {
  constructor(private readonly stats: PublicStatisticsService) {}

  @ApiOperation({ summary: "Compteurs d'activité agrégés de la plateforme" })
  @ApiResponse({ status: 200, description: 'Statistiques publiques (cache 60 s)' })
  @Public()
  @Get()
  get() {
    return this.stats.lire();
  }
}
