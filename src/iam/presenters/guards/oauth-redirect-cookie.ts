import type { Request } from 'express';
import type { SocialProfile } from 'src/iam/applications/models/social-profile';

/**
 * Cible de redirection post-login OAuth (application front vs back-office admin),
 * mémorisée dans un cookie DÉDIÉ.
 *
 * ⚠ Pourquoi un cookie et pas le paramètre OAuth `state` : le `state` est
 * réservé à la protection CSRF gérée par `CookieOAuthStateStore`. passport-oauth2
 * traite un `state` fourni sous forme de string en court-circuit — il ne pose
 * alors PAS le cookie de state (le `store()` n'est pas appelé), mais le vérifie
 * quand même au callback → la vérification échoue (aucun cookie) et l'auth est
 * rejetée (« Connexion annulée ou refusée »). On isole donc la cible ici.
 */
const REDIRECT_COOKIE = 'beown_oauth_redirect';
const TTL_MS = 10 * 60 * 1000;

export type OAuthRedirectTarget = 'frontend' | 'admin';

/**
 * Profil social remonté par Passport, enrichi par les callback guards de la
 * cible de redirection. Remplace le `any` que se passaient guards et
 * contrôleur.
 */
export type AuthenticatedSocialUser = SocialProfile & {
  _redirectTo?: OAuthRedirectTarget;
};

export function setOAuthRedirectCookie(
  req: Request,
  target: OAuthRedirectTarget,
): void {
  req.res?.cookie(REDIRECT_COOKIE, target, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_MS,
    path: '/auth',
  });
}

/** Lit puis efface la cible mémorisée à l'initiation du flux OAuth. */
export function readOAuthRedirectCookie(req: Request): OAuthRedirectTarget {
  const raw = req.headers?.cookie
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${REDIRECT_COOKIE}=`))
    ?.slice(REDIRECT_COOKIE.length + 1);
  req.res?.clearCookie(REDIRECT_COOKIE, { path: '/auth' });
  return raw === 'admin' ? 'admin' : 'frontend';
}
