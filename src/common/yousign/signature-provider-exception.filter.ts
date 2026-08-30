import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SIGNATURE_PROVIDER_UNAVAILABLE,
  SignatureProviderUnavailableError,
} from 'src/common/yousign/signature-provider.error';
import { Sentry } from 'src/observability/sentry';

/**
 * Traduit une indisponibilité du prestataire de signature en réponse HTTP.
 *
 * Pourquoi 503 et pas 500 : un 500 dit « nous avons un bug », ce qui est faux,
 * et surtout il ne dit RIEN de ce que l'utilisateur doit faire. Un 503 dit la
 * seule chose vraie et utile — le service est temporairement hors d'état, la
 * demande n'a pas été prise, elle peut être rejouée à l'identique. C'est aussi
 * le seul statut qui porte `Retry-After`, et celui que la supervision compte
 * comme une indisponibilité de dépendance plutôt qu'un défaut applicatif.
 *
 * Pourquoi pas 502 : un Bad Gateway annonce une réponse INVALIDE d'un serveur
 * amont. Ici la réponse du prestataire est parfaitement formée — un 401 clair,
 * qui nous dit que l'abonnement est échu. Ce n'est pas la passerelle qui est
 * cassée, c'est le service en aval qui refuse de nous servir pour l'instant.
 *
 * Le message renvoyé au client est FIXE et rédigé pour un vendeur : jamais le
 * texte du prestataire, jamais un statut technique, jamais un nom de fournisseur.
 * Le détail brut (« subscription… trial period ») reste dans le journal serveur
 * et dans Sentry, où un exploitant peut agir dessus.
 *
 * Le filtre est déclaré au niveau des contrôleurs du marché secondaire : il
 * couvre donc TOUTES leurs routes, actuelles et futures, sans qu'un `try/catch`
 * soit à recopier route par route (OCP). Toute autre exception continue de
 * suivre exactement le chemin qu'elle suivait avant.
 */

/** Délai indicatif avant nouvelle tentative, en secondes. */
export const DELAI_AVANT_NOUVELLE_TENTATIVE_S = 300;

/**
 * Message utilisateur. Vrai pour tout point d'entrée couvert : aucune de ces
 * routes ne conserve d'état lorsque la signature échoue — l'acceptation joue sa
 * compensation et remet l'annonce en attente de réponse.
 */
export const MESSAGE_SIGNATURE_INDISPONIBLE =
  'Le service de signature électronique est momentanément indisponible. ' +
  "Votre acceptation n'a pas été enregistrée et aucun engagement n'a été pris : " +
  "l'annonce reste disponible et la marque d'intérêt est intacte. " +
  'Réessayez dans quelques minutes.';

@Catch(SignatureProviderUnavailableError)
export class SignatureProviderExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SignatureProviderExceptionFilter.name);

  catch(error: SignatureProviderUnavailableError, host: ArgumentsHost): void {
    const contexteHttp = host.switchToHttp();
    const response = contexteHttp.getResponse<Response>();
    const requete = contexteHttp.getRequest<{
      method?: string;
      url?: string;
    }>();

    // Un incident de dépendance doit rester VISIBLE : le filtre du contrôleur
    // court-circuite le filtre global, c'est donc ici que la remontée se fait.
    this.logger.error(
      `Signature indisponible sur ${requete?.method ?? '?'} ${requete?.url ?? '?'} — ` +
        `operation=${error.operation} motif=${error.motif} ` +
        `statutFournisseur=${error.statutFournisseur ?? 'aucun'} ` +
        `detail=${error.detailFournisseur ?? 'aucun'}`,
    );
    Sentry.captureException(error);

    response.setHeader('Retry-After', String(DELAI_AVANT_NOUVELLE_TENTATIVE_S));
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: SIGNATURE_PROVIDER_UNAVAILABLE,
      message: MESSAGE_SIGNATURE_INDISPONIBLE,
      retryAfterSeconds: DELAI_AVANT_NOUVELLE_TENTATIVE_S,
    });
  }
}
