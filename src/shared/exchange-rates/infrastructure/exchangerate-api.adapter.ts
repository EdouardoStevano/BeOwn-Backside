import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEVISE_DE_BASE, normaliserTaux } from '../domains/exchange-rates';
import type { ExchangeRateProvider } from '../applications/ports/exchange-rate-provider.port';

/** Borne dure : une source de confort ne retient jamais une requête entrante. */
const DELAI_MAX_MS = 4_000;

/**
 * Adapter du fournisseur exchangerate-api.com.
 *
 * LA CLÉ VIT ICI, CÔTÉ SERVEUR. Le front l'embarquait dans une variable
 * `VITE_EXCHANGE_RATE_API_KEY`, INLINÉE dans le bundle au build : elle était
 * lisible par quiconque ouvrait les sources de la page, et réutilisable
 * jusqu'à épuisement du quota du compte. Le navigateur ne voit désormais
 * qu'un résultat.
 *
 * Ne LÈVE JAMAIS : clé absente, panne, délai dépassé, réponse inexploitable
 * rendent `null`. Le service appelant sait se dégrader, et une source
 * d'affichage n'a pas à faire tomber une requête.
 */
@Injectable()
export class ExchangeRateApiAdapter implements ExchangeRateProvider {
  private readonly logger = new Logger(ExchangeRateApiAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async lireTauxDepuisEuro(): Promise<Record<string, number> | null> {
    const cle = this.config.get<string>('EXCHANGE_RATE_API_KEY')?.trim();
    if (!cle) {
      // Journalisé une fois par tentative, pas au démarrage : l'absence de
      // taux est un mode DÉGRADÉ acceptable, pas un défaut de configuration
      // bloquant — la plateforme compte en euros.
      this.logger.warn(
        'EXCHANGE_RATE_API_KEY absente : taux de change non servis.',
      );
      return null;
    }

    try {
      const reponse = await fetch(
        `https://v6.exchangerate-api.com/v6/${encodeURIComponent(cle)}/latest/${DEVISE_DE_BASE}`,
        { signal: AbortSignal.timeout(DELAI_MAX_MS) },
      );
      if (!reponse.ok) {
        // La clé n'est JAMAIS journalisée, y compris en cas d'erreur
        // d'authentification chez le fournisseur.
        this.logger.warn(
          `Fournisseur de taux de change : réponse ${reponse.status}.`,
        );
        return null;
      }

      const corps = (await reponse.json()) as {
        result?: string;
        conversion_rates?: Record<string, unknown>;
      };
      if (corps?.result && corps.result !== 'success') {
        this.logger.warn(
          `Fournisseur de taux de change : résultat « ${corps.result} ».`,
        );
        return null;
      }

      const taux = normaliserTaux(corps?.conversion_rates);
      return Object.keys(taux).length > 0 ? taux : null;
    } catch (erreur) {
      this.logger.warn(
        `Fournisseur de taux de change injoignable : ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
      return null;
    }
  }
}
