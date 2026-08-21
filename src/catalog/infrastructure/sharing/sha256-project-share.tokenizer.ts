import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { ProjectShareTokenizer } from 'src/catalog/application/ports/project-share-tokenizer.port';

/**
 * Jeton de partage : condensat SHA-256 de `{projetId}{secret}`, tronqué à
 * seize caractères hexadécimaux.
 *
 * La construction est reprise **à l'identique** — les liens déjà distribués
 * doivent continuer de fonctionner. Elle vivait dupliquée dans deux méthodes de
 * `ProjectController`, avec la lecture de `process.env` à chaque appel (§12.5).
 *
 * Deux différences, aucune sur la valeur du jeton :
 *
 * - le secret est lu **une fois, au démarrage**. Absent, le contrôleur levait
 *   une `Error` nue au premier partage demandé — un 500 sans message, en
 *   production, longtemps après le déploiement fautif. Le module refuse
 *   maintenant de démarrer ;
 * - la comparaison passe par `timingSafeEqual`. Le jeton est court et dérivé
 *   d'un identifiant public, donc l'enjeu est mince, mais comparer un secret
 *   avec `===` n'a aucun intérêt à être conservé.
 */
@Injectable()
export class Sha256ProjectShareTokenizer implements ProjectShareTokenizer {
  private static readonly LONGUEUR_JETON = 16;
  private static readonly URL_FRONT_PAR_DEFAUT = 'http://localhost:5173';

  private readonly logger = new Logger(Sha256ProjectShareTokenizer.name);
  private readonly secret: string;
  private readonly urlFront: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('PROJECT_SHARE_SECRET');
    if (!secret) {
      throw new Error(
        'PROJECT_SHARE_SECRET is not configured — les liens de partage de projet ne peuvent pas être signés.',
      );
    }
    this.secret = secret;

    const urlFront = config.get<string>('FRONTEND_URL');
    if (!urlFront) {
      this.logger.warn(
        `FRONTEND_URL absent : les liens de partage pointeront vers ${Sha256ProjectShareTokenizer.URL_FRONT_PAR_DEFAUT}.`,
      );
    }
    this.urlFront =
      urlFront || Sha256ProjectShareTokenizer.URL_FRONT_PAR_DEFAUT;
  }

  tokenPour(projetId: string): string {
    return createHash('sha256')
      .update(`${projetId}${this.secret}`)
      .digest('hex')
      .substring(0, Sha256ProjectShareTokenizer.LONGUEUR_JETON);
  }

  correspond(token: string, projetId: string): boolean {
    const attendu = Buffer.from(this.tokenPour(projetId));
    const fourni = Buffer.from(token ?? '');
    return attendu.length === fourni.length && timingSafeEqual(attendu, fourni);
  }

  urlPour(token: string): string {
    return `${this.urlFront}/p/${token}`;
  }
}
