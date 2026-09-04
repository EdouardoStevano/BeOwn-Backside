import { PublicUser } from 'src/iam/domains/mappers/user.mapper';

export interface TokenPayload {
  sub: number;
  email: string;
  role?: string;
  refreshTokenId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Ce qu'un refresh token consommé permet d'affirmer : **l'identité de la
 * session**, rien d'autre.
 *
 * Volontairement dépourvu de `role` : le rôle porté par l'ancien token était
 * recopié tel quel dans le nouveau couple, si bien qu'un changement de rôle
 * décidé par un administrateur restait sans effet tant que l'utilisateur
 * faisait tourner son refresh token — une rétrogradation d'administrateur
 * était contournable indéfiniment. Le rôle est désormais RELU en base par
 * l'appelant ({@link RefreshTokenUseCase}) ; ce type est la garantie de type
 * qu'aucun claim entrant ne peut plus resservir d'autorisation.
 *
 * `email` sert à l'identification de la session côté cache (la clé de rotation
 * en dépend), pas à autoriser quoi que ce soit.
 */
export interface RefreshSessionIdentity {
  sub: number;
  email: string;
}

/**
 * Ce que renvoie une **ouverture de session** : les tokens et l'état du compte.
 * Forme commune au sign-in et au rafraîchissement, pour que le front traite les
 * deux réponses avec le même code.
 *
 * Distinct d'`AuthTokens`, qui reste le couple de tokens nu : c'est ce que
 * produit `TokenService`, dont le rôle s'arrête aux identifiants — la relecture
 * du compte appartient au use case, qui seul connaît le repository.
 *
 * `user` est typé `PublicUser` (et non `User`) : le domaine décide de ce qui
 * est publiable, et l'empreinte du mot de passe n'y figure pas.
 */
export interface AuthSession extends AuthTokens {
  user: PublicUser;
}

/**
 * Purpose claim carried by every email token. Email-verification and
 * password-reset tokens used to be generated/verified through the exact
 * same JWT (no claim distinguishing them), so a verification token — which
 * travels in a GET URL and ends up in server/proxy logs and browser
 * history — could be replayed against the reset-password endpoint and used
 * to take over the account. Each issue site now stamps its purpose and
 * each verify site rejects a mismatch.
 */
export type EmailTokenPurpose = 'email_verify' | 'password_reset';

export interface EmailTokenPayload {
  sub: number;
  email: string;
  emailTokenId: string;
  type: EmailTokenPurpose;
}

/**
 * Type claim des tokens de désinscription marketing. Distinct des purposes
 * email (`email_verify` / `password_reset`) : ces derniers sont à usage
 * unique (Redis) et à TTL court, alors qu'un lien de désinscription doit
 * rester valable longtemps dans un email archivé — donc pas de single-use.
 * Le claim `type` empêche qu'un token de vérification d'email soit rejoué
 * sur l'endpoint de désinscription (et inversement).
 */
export const NOTIF_UNSUBSCRIBE_TYPE = 'notif_unsubscribe';

export interface UnsubscribeTokenPayload {
  sub: number;
  type: typeof NOTIF_UNSUBSCRIBE_TYPE;
}

/**
 * Audience dédiée aux tokens de désinscription. Défense en profondeur : même
 * si un contrôle de claim `type` était oublié quelque part, un token signé
 * avec cette audience est structurellement rejeté par toute vérification
 * utilisant l'audience standard (access, refresh, email).
 */
export const UNSUBSCRIBE_TOKEN_AUDIENCE = 'beown-unsubscribe';
