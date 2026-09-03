import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
// Minimum acceptable score for reCAPTCHA v3 (0.0 = bot, 1.0 = human)
const MIN_SCORE = 0.5;

interface RecaptchaResponse {
  success: boolean;
  score?: number;       // v3 only
  action?: string;      // v3 only
  'error-codes'?: string[];
}

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secret: string;
  private readonly enabled: boolean;
  /**
   * Production sans `RECAPTCHA_SECRET_KEY` : le service ne peut pas vérifier,
   * et ne doit pas pour autant laisser passer. Voir le commentaire du
   * constructeur.
   */
  private readonly misconfiguredInProduction: boolean;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('RECAPTCHA_SECRET_KEY') ?? '';
    const isProduction = config.get('NODE_ENV') === 'production';
    // Échappatoire de développement : `RECAPTCHA_ENABLED=false` court-circuite
    // la vérification, pour travailler en local sans jeton côté front.
    const optedOut = config.get<string>('RECAPTCHA_ENABLED') === 'false';

    if (optedOut && isProduction) {
      // Un flag égaré ne doit jamais ouvrir le sign-up en production : on
      // l'ignore, bruyamment, plutôt que de désactiver la protection.
      this.logger.error(
        'RECAPTCHA_ENABLED=false ignoré : la désactivation du CAPTCHA est réservée au développement.',
      );
    }

    const disabledForDev = optedOut && !isProduction;
    if (disabledForDev) {
      this.logger.warn(
        'CAPTCHA désactivé (RECAPTCHA_ENABLED=false) — développement uniquement.',
      );
    }

    // Fail-closed sur secret manquant en production.
    //
    // Le calcul de `enabled` ci-dessous exige un secret. Conséquence non
    // voulue jusqu'ici : en production, un `RECAPTCHA_SECRET_KEY` absent (clé
    // oubliée dans le Secret k8s, faute de frappe sur le nom) désactivait la
    // protection EN SILENCE — `verify()` retournait immédiatement et
    // `POST /auth/sign-up` s'ouvrait à la création de comptes en masse, sans
    // qu'aucun log ni aucune alerte ne le signale. Le mode dégradé était
    // indiscernable du mode nominal.
    //
    // Désormais : en production, l'absence de secret est une erreur de
    // configuration qui REFUSE (503), et elle est journalisée bruyamment au
    // démarrage — donc visible dans les logs du premier pod, avant même
    // qu'un utilisateur ne tente une inscription.
    //
    // Hors production : comportement inchangé (secret absent = CAPTCHA
    // désactivé), pour ne rien imposer au poste local ni à la CI.
    this.misconfiguredInProduction = isProduction && !this.secret;
    if (this.misconfiguredInProduction) {
      this.logger.error(
        'RECAPTCHA_SECRET_KEY absente en production — les routes protégées par ' +
          'CAPTCHA refuseront (503) tant que la clé ne sera pas renseignée. ' +
          'Renseigner RECAPTCHA_SECRET_KEY dans le Secret beown-backend-secrets.',
      );
    }

    this.enabled =
      !!this.secret && config.get('NODE_ENV') !== 'test' && !disabledForDev;
  }

  async verify(token: string | undefined): Promise<void> {
    if (this.misconfiguredInProduction) {
      // Ne jamais retomber en « pas de vérification » : sans secret, on est
      // incapable de distinguer un humain d'un bot, donc on refuse.
      this.logger.error(
        'Vérification CAPTCHA impossible : RECAPTCHA_SECRET_KEY non configurée.',
      );
      throw new ServiceUnavailableException(
        'Service de vérification indisponible. Réessayez dans un instant.',
      );
    }

    if (!this.enabled) return;

    if (!token) {
      throw new BadRequestException('Vérification CAPTCHA requise.');
    }

    let data: RecaptchaResponse;
    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.secret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      data = await res.json() as RecaptchaResponse;
    } catch (err) {
      this.logger.error('reCAPTCHA network error', err);
      throw new BadRequestException('Service de vérification indisponible. Réessayez dans un instant.');
    }

    if (!data.success) {
      this.logger.warn('reCAPTCHA failed', data['error-codes']);
      throw new BadRequestException('Vérification CAPTCHA échouée. Veuillez réessayer.');
    }

    // reCAPTCHA v3 score check (v2 tokens don't include a score)
    if (data.score !== undefined && data.score < MIN_SCORE) {
      this.logger.warn(`reCAPTCHA low score: ${data.score}`);
      throw new BadRequestException('Activité suspecte détectée. Veuillez réessayer.');
    }
  }
}
