import { Injectable } from '@nestjs/common';
import { RecaptchaService } from 'src/common/recaptcha/recaptcha.service';
import { CaptchaVerifier } from 'src/iam/domain/ports/captcha.verifier';
import { CaptchaVerificationFailedError } from 'src/iam/domain/errors/iam.errors';

/**
 * Adapter du port CAPTCHA_VERIFIER. Traduit l'échec du service reCAPTCHA, qui
 * s'exprime en HttpException, en erreur de domaine — la couche application ne
 * doit pas voir passer de statut HTTP.
 */
@Injectable()
export class RecaptchaVerifier implements CaptchaVerifier {
  constructor(private readonly recaptchaService: RecaptchaService) {}

  async verify(token?: string): Promise<void> {
    try {
      await this.recaptchaService.verify(token);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Vérification anti-robot échouée.';
      throw new CaptchaVerificationFailedError(message);
    }
  }
}
