import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
} from 'src/iam/applications/ports/totp-generator.port';

/** Ce que l'enrôlement TOTP remet à l'utilisateur. */
export interface TotpSecret {
  /** URI `otpauth://` à encoder en QR code pour l'application authenticator. */
  uri: string;
  /** Secret partagé, en clair — à chiffrer avant persistance (cf. SecretCipher). */
  secret: string;
}

/**
 * Composition d'un secret TOTP enrôlable : tirer le secret, décider sous quel
 * nom il apparaîtra dans l'application de l'utilisateur, et assembler l'URI.
 *
 * Seule la première et la dernière étape sont affaire de bibliothèque, et
 * elles restent dans `TotpGenerator`. Le nom d'émetteur, lui, est une décision
 * de produit lue en configuration : il vivait dans l'adapter otplib, où un
 * second générateur aurait recopié le repli d'ancien nom de variable — avec le
 * risque d'en oublier la moitié et de faire disparaître les comptes déjà
 * enrôlés de l'application authenticator.
 */
@Injectable()
export class TotpSecretService {
  constructor(
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    private readonly configService: ConfigService,
  ) {}

  /** Prépare un facteur TOTP pour `label` (l'adresse email du compte). */
  create(label: string): TotpSecret {
    const secret = this.totpGenerator.generateSecret();

    return {
      secret,
      uri: this.totpGenerator.buildUri({
        issuer: this.issuer(),
        label,
        secret,
        image: this.logoUrl(),
      }),
    };
  }

  /**
   * Logo affiché en vignette du compte dans l'application authenticator.
   *
   * L'URL est absolue et publique par nécessité : c'est le téléphone de
   * l'utilisateur qui la télécharge, hors de toute session. Une adresse en
   * `localhost` ne résoudra donc jamais depuis un mobile — d'où le réglage par
   * environnement plutôt qu'une valeur codée.
   *
   * Absente, aucun paramètre `image` n'est ajouté et l'URI reste conforme au
   * Key Uri Format.
   */
  private logoUrl(): string | undefined {
    const explicit = this.configService.get<string>('MFA_LOGO_URL')?.trim();
    if (explicit) return explicit;

    const apiUrl = this.configService.get<string>('API_URL')?.trim();
    return apiUrl ? `${apiUrl}/images/beown_logo_circle.png` : undefined;
  }

  /**
   * Nom affiché dans l'application authenticator. `TFA_APP_NAME` reste accepté
   * en repli : renommer une variable d'environnement sans filet ferait échouer
   * le démarrage des environnements déjà déployés.
   */
  private issuer(): string {
    return (
      this.configService.get<string>('MFA_APP_NAME') ??
      this.configService.getOrThrow<string>('TFA_APP_NAME')
    );
  }
}
