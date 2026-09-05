import { Module } from '@nestjs/common';
import { ExchangeRatesService } from './applications/exchange-rates.service';
import { EXCHANGE_RATE_PROVIDER } from './applications/ports/exchange-rate-provider.port';
import { ExchangeRateApiAdapter } from './infrastructure/exchangerate-api.adapter';
import { ExchangeRatesController } from './presenters/http/exchange-rates.controller';

/**
 * Proxy serveur des taux de change. Le service applicatif (cache, politique de
 * repli) dépend du PORT ; l'adapter du fournisseur est branché ici, et lui
 * seul connaît la clé d'API. Changer de fournisseur ne demande qu'une autre
 * classe et une ligne dans ce module.
 */
@Module({
  providers: [
    ExchangeRatesService,
    { provide: EXCHANGE_RATE_PROVIDER, useClass: ExchangeRateApiAdapter },
  ],
  controllers: [ExchangeRatesController],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
