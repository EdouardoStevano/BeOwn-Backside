import { PublicUser } from 'src/iam/domains/mappers/user.mapper';

/**
 * Type des deux jetons de SESSION, porté par le claim `type`.
 *
 * Correctif d'une confusion de jetons : access et refresh étaient signés avec
 * le même secret, la même audience et le même émetteur, et aucun des deux ne
 * portait de claim distinctif. Un refresh token présenté en `Authorization:
 * Bearer` passait donc `verifyAccessToken` — il valait access token pendant
 * toute sa durée de vie (24 h). Conséquence directe : la révocation d'un rôle
 * ou d'un accès, qui repose sur la ROTATION du refresh token pour reprendre le
 * rôle en base, restait contournable 24 h en n'appelant jamais
 * `POST /auth/refresh-tokens` et en présentant le refresh token comme access.
 *
 * Chaque jeton est désormais estampillé à l'émission et chaque site de
 * vérification exige l'estampille qui lui correspond.
 */
export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';

export type SessionTokenType =
  | typeof ACCESS_TOKEN_TYPE
  | typeof REFRESH_TOKEN_TYPE;

/**
 * Politique de transition, en un seul endroit — partagée par `TokenService` et
 * par la passerelle WebSocket, qui doivent accepter exactement les mêmes
 * jetons.
 *
 * Les jetons émis AVANT ce déploiement ne portent aucun claim `type`.
 * `exigerLeClaimType` (variable d'env `JWT_REQUIRE_TYPE_CLAIM`) vaut `true`
 * par défaut : fail-closed, les sessions ouvertes avant la mise en production
 * sont invalidées et les fronts repassent par une authentification. Le mettre
 * à `false` le temps d'un déploiement ouvre une fenêtre de tolérance : un
 * jeton SANS type est alors accepté comme access — ce qui réexpose exactement
 * la confusion corrigée ici, mais seulement pour les jetons antérieurs, et au
 * plus le temps d'un TTL de refresh (24 h) après quoi la rotation naturelle a
 * tout ré-estampillé. Un jeton portant `type: 'refresh'` est refusé dans les
 * DEUX modes.
 */
export const accepteCommeJetonDacces = (
  type: string | undefined,
  exigerLeClaimType: boolean,
): boolean =>
  type === ACCESS_TOKEN_TYPE || (type === undefined && !exigerLeClaimType);

/** Symétrique de {@link accepteCommeJetonDacces} pour le chemin de rotation. */
export const accepteCommeJetonDeRafraichissement = (
  type: string | undefined,
  exigerLeClaimType: boolean,
): boolean =>
  type === REFRESH_TOKEN_TYPE || (type === undefined && !exigerLeClaimType);

export interface TokenPayload {
  sub: number;
  email: string;
  role?: string;
  refreshTokenId: string | null;
  /**
   * Absent des charges utiles passées à `generateTokens` (c'est le service qui
   * estampille), présent sur toute charge utile RELUE d'un jeton émis depuis
   * ce correctif.
   */
  type?: SessionTokenType;
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
