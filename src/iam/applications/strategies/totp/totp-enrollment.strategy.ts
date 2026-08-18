import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import {
  TOTP_GENERATOR,
  type TotpGenerator,
} from 'src/iam/applications/ports/totp-generator.port';
import {
  SECRET_CIPHER,
  type SecretCipher,
} from 'src/iam/applications/ports/secret-cipher.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  InvalidTotpCodeError,
  TotpNotConfiguredError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import { TotpSecretService } from '../../services/totp/totp-secret.service';
import { AuthMailerService } from '../../services/auth-mailer.service';
import {
  MfaEnrollmentChallenge,
  MfaEnrollmentConfirmation,
  MfaEnrollmentRequest,
  MfaEnrollmentStrategy,
} from '../mfa/mfa-enrollment.strategy';

/**
 * Enrôlement TOTP (Google Authenticator & co).
 *
 * Le facteur est enrôlé **sur le compte**, qui en est la racine : c'est en
 * sauvegardant `User` qu'on le persiste. Le chiffrement du secret revient à
 * `SecretCipher` et sa composition à `TotpSecretService` — cette classe ne
 * connaît ni TypeORM, ni `crypto`, ni otplib.
 */
@Injectable()
export class TotpEnrollmentStrategy implements MfaEnrollmentStrategy {
  private readonly logger = new Logger(TotpEnrollmentStrategy.name);

  readonly method = MfaMethodType.TOTP;

  constructor(
    // Deux dépendances distinctes, chacune à sa place : composer un secret
    // enrôlable relève de la politique (nom d'émetteur, forme de l'URI),
    // éprouver un code relève du calcul RFC 6238.
    private readonly totpSecrets: TotpSecretService,
    @Inject(TOTP_GENERATOR) private readonly totpGenerator: TotpGenerator,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SECRET_CIPHER) private readonly secretCipher: SecretCipher,
    private readonly authMailer: AuthMailerService,
    private readonly configService: ConfigService,
  ) {}

  async start(request: MfaEnrollmentRequest): Promise<MfaEnrollmentChallenge> {
    const user = await this.userRepository.findByIdWithFacteurs(request.userId);
    if (!user) throw new UserNotFoundError();

    const payload = this.totpSecrets.create(user.email || request.email);

    // Au plus un secret en attente, comme sur les canaux email/SMS : un QR code
    // affiché puis abandonné ne doit pas rester enrôlable. `enrolerFacteur`
    // purge les attentes du canal sans toucher aux facteurs actifs — l'ancien
    // authenticator continue de servir tant que le nouveau n'est pas confirmé.
    //
    // `credential` porte ici le secret partagé **chiffré** — jamais en clair.
    // Le même champ contient une adresse ou un numéro sur les autres canaux ;
    // c'est `method` qui dit lequel.
    user.enrolerFacteur(this.method, this.secretCipher.encrypt(payload.secret));
    await this.userRepository.update(user);

    await this.mailQrCodeInDevelopment(user.email || request.email, payload);

    return { method: this.method, secret: payload.secret, uri: payload.uri };
  }

  /**
   * Envoie le QR code par email quand `TOTP_QR_EMAIL` l'autorise — un confort
   * de développement, jamais un comportement de production.
   *
   * Postman et les clients HTTP en ligne de commande ne savent pas dessiner
   * l'URI `otpauth://` : sans image, impossible d'ajouter le facteur à une
   * application authenticator pour éprouver le parcours. Le message comble ce
   * trou, et Mailpit l'affiche.
   *
   * Opt-in **explicite** plutôt qu'un simple `NODE_ENV !== 'production'` : ce
   * message transporte le secret TOTP en clair, ce qui vide le facteur d'une
   * partie de son intérêt. Un environnement de préproduction partagé tourne
   * lui aussi hors production, et n'a aucune raison de l'émettre. Il faut donc
   * l'avoir demandé, et la production le refuse même si on le lui demande.
   */
  private async mailQrCodeInDevelopment(
    email: string,
    payload: { uri: string; secret: string },
  ): Promise<void> {
    if (!this.isQrEmailEnabled()) return;

    try {
      await this.authMailer.sendTotpQrCode(email, payload.uri, payload.secret);
    } catch (err) {
      // L'enrôlement a réussi : le secret est en base et la réponse HTTP porte
      // déjà l'URI. Un envoi raté ne doit pas le défaire — au pire le
      // développeur recopie la clé à la main.
      this.logger.warn(
        `Échec de l'envoi du QR code TOTP à ${email} — enrôlement conservé.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private isQrEmailEnabled(): boolean {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      return false;
    }

    return (
      this.configService.get<string>('TOTP_QR_EMAIL')?.trim().toLowerCase() ===
      'true'
    );
  }

  async hasPending(userId: number): Promise<boolean> {
    const compte = await this.userRepository.findByIdWithFacteurs(userId);
    return compte !== null && compte.facteurEnAttente(this.method) !== null;
  }

  async confirm(confirmation: MfaEnrollmentConfirmation): Promise<void> {
    const { userId, otp } = confirmation;

    const user = await this.userRepository.findByIdWithFacteurs(userId);
    if (!user) throw new UserNotFoundError();

    const methods = user.facteurs.filter(
      (facteur) => facteur.method === this.method,
    );
    if (methods.length === 0) {
      throw new TotpNotConfiguredError();
    }

    let validMethod: (typeof methods)[number] | null = null;
    for (const method of methods) {
      const secret = this.secretCipher.decrypt(method.encryptedSecret);
      if (await this.totpGenerator.verify(otp, secret)) {
        validMethod = method;
        break;
      }
    }

    if (!validMethod) {
      throw new InvalidTotpCodeError();
    }

    // Première vérification réussie d'un facteur fraîchement enrôlé : il
    // devient l'unique facteur actif du compte, tous canaux confondus —
    // `confirmerFacteur` s'en charge, l'appelant n'a rien à désactiver.
    if (validMethod.isPending()) {
      user.confirmerFacteur(this.method);
      await this.userRepository.update(user);
    }
  }
}
