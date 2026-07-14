export const TWO_FACTOR_GATEWAY = Symbol('TWO_FACTOR_GATEWAY');

/**
 * Les trois canaux de second facteur, dans le vocabulaire d'IAM. Le contexte
 * Users a le sien (UserPreferences.twoFactorMethod) ; l'adapter traduit. IAM ne
 * dépend donc pas de l'enum d'un autre contexte, même si les valeurs coïncident.
 */
export enum TwoFactorMethod {
  EMAIL = 'email',
  SMS = 'sms',
  TOTP = 'totp',
}

/**
 * Un canal enrôlé sur un compte.
 *
 * `credential` est ce qui permet de challenger : l'adresse pour EMAIL, le numéro
 * E.164 pour SMS, le secret partagé pour TOTP. C'est le seul endroit où IAM
 * manipule un secret persisté par Users — il en a besoin pour vérifier un code,
 * exactement comme Users a besoin du hash pour vérifier un mot de passe.
 */
export interface TwoFactorEnrollment {
  method: TwoFactorMethod;
  credential: string;
  isActive: boolean;
}

/**
 * Couche anti-corruption pour tout ce qui touche au second facteur. Même rôle
 * que AccountGateway : IAM parle sa langue, l'adapter traduit vers le contrat
 * publié de Users.
 */
export interface TwoFactorGateway {
  /** La méthode confirmée du compte, ou null si la 2FA est désactivée. */
  findActive(email: string): Promise<TwoFactorEnrollment | null>;

  /** La méthode enrôlée sur ce canal, confirmée ou en attente. */
  findEnrollment(
    accountId: number,
    method: TwoFactorMethod,
  ): Promise<TwoFactorEnrollment | null>;

  startEnrollment(
    accountId: number,
    method: TwoFactorMethod,
    credential: string,
  ): Promise<void>;

  activate(accountId: number, method: TwoFactorMethod): Promise<void>;

  disable(accountId: number): Promise<void>;
}
