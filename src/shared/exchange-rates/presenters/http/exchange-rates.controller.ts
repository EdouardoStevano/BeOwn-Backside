import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/common/auth/public.decorator';
import { ExchangeRatesService } from '../../applications/exchange-rates.service';
import type { TauxDeChange } from '../../domains/exchange-rates';

/**
 * Palier de lecture d'une route publique et non authentifiée. Le cache d'une
 * heure protège déjà le quota du fournisseur ; ce palier protège le processus
 * lui-même d'un martèlement.
 */
const DEBIT_LECTURE_TAUX = {
  short: { ttl: 60_000, limit: 60 },
  medium: { ttl: 60_000, limit: 60 },
} as const;

/**
 * `GET /public/exchange-rates` — taux de change servis par la plateforme.
 *
 * Le front interrogeait DIRECTEMENT le fournisseur avec une variable
 * `VITE_EXCHANGE_RATE_API_KEY`, inlinée dans le bundle au build : la clé était
 * lisible dans les sources de la page et réutilisable jusqu'à épuisement du
 * quota. Ce proxy la ramène côté serveur, où elle est lue en variable
 * d'environnement et n'apparaît dans aucune réponse ni aucun log.
 *
 * Contrat figé par le consommateur (`exchangeRates.datasource.ts` du
 * Frontside) : `{ base, rates, fetchedAt }`.
 */
@ApiTags('Public — Taux de change')
@Throttle(DEBIT_LECTURE_TAUX)
@Controller('public/exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly taux: ExchangeRatesService) {}

  @ApiOperation({
    summary: "Taux de change depuis l'euro (cache serveur 1 h)",
    description:
      'La clé du fournisseur reste côté serveur. `fetchedAt` donne la date de ' +
      'la lecture : en cas de panne du fournisseur, la dernière lecture connue ' +
      'est servie, avec son horodatage d’origine.',
  })
  @ApiResponse({ status: 200, description: 'Taux depuis EUR' })
  @ApiResponse({
    status: 503,
    description: 'Aucun taux disponible (clé absente, ou fournisseur jamais joint)',
  })
  // Pas de cache navigateur : c'est le cache SERVEUR qui fait foi, et lui seul
  // sait servir une valeur de repli datée.
  @Header('Cache-Control', 'no-store')
  @Public()
  @Get()
  async lire(): Promise<TauxDeChange> {
    const taux = await this.taux.lire();
    if (!taux) {
      throw new ServiceUnavailableException(
        'Taux de change indisponibles pour le moment.',
      );
    }
    return taux;
  }
}
