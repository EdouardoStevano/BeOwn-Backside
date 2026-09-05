import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEVISE_DE_BASE,
  type TauxDeChange,
} from '../domains/exchange-rates';
import {
  EXCHANGE_RATE_PROVIDER,
  type ExchangeRateProvider,
} from './ports/exchange-rate-provider.port';

/**
 * Taux de change publics, lus UNE FOIS PAR HEURE chez le fournisseur.
 *
 * Le cache n'est pas une optimisation : c'est ce qui rend l'endpoint public
 * tenable. Sans lui, chaque visiteur anonyme déclencherait un appel sortant
 * facturé au quota du compte — n'importe qui pourrait épuiser l'abonnement en
 * bouclant sur l'URL. Une heure est très en deçà de la volatilité utile pour
 * un simple affichage : les montants de la plateforme sont EN EUROS, les taux
 * ne servent qu'à les rendre lisibles dans une autre devise.
 *
 * DERNIÈRE VALEUR CONNUE SERVIE EN PANNE : si le fournisseur ne répond plus,
 * on préfère servir les taux de la dernière lecture réussie, horodatés par
 * `fetchedAt`, plutôt que rien. L'appelant voit l'âge de la donnée et décide.
 * Ne rien servir ferait basculer la vitrine sur des taux de repli codés en
 * dur, ce qui serait à la fois plus vieux et non daté.
 *
 * Cache EN MÉMOIRE DE PROCESSUS — même entorse assumée que
 * `PublicStatisticsService` : donnée publique, identique pour tous, dont la
 * perte au redémarrage coûte un appel sortant.
 */
@Injectable()
export class ExchangeRatesService {
  private static readonly TTL_MS = 3_600_000;
  private readonly logger = new Logger(ExchangeRatesService.name);
  private cache: { calculeA: number; valeur: TauxDeChange } | null = null;

  constructor(
    @Inject(EXCHANGE_RATE_PROVIDER)
    private readonly provider: ExchangeRateProvider,
  ) {}

  /** Taux courants, ou `null` si aucun n'a jamais pu être obtenu. */
  async lire(): Promise<TauxDeChange | null> {
    const maintenant = Date.now();
    if (
      this.cache &&
      maintenant - this.cache.calculeA < ExchangeRatesService.TTL_MS
    ) {
      return this.cache.valeur;
    }

    const rates = await this.provider.lireTauxDepuisEuro();
    if (!rates || Object.keys(rates).length === 0) {
      if (this.cache) {
        this.logger.warn(
          'Taux de change indisponibles chez le fournisseur — dernière lecture ' +
            `connue servie (${this.cache.valeur.fetchedAt}).`,
        );
        // Le cache n'est PAS rafraîchi : on retentera au prochain appel plutôt
        // que d'attendre une heure de plus.
        return this.cache.valeur;
      }
      this.logger.warn(
        'Taux de change indisponibles et aucune lecture antérieure en cache.',
      );
      return null;
    }

    const valeur: TauxDeChange = {
      base: DEVISE_DE_BASE,
      rates,
      fetchedAt: new Date(maintenant).toISOString(),
    };
    this.cache = { calculeA: maintenant, valeur };
    return valeur;
  }
}
