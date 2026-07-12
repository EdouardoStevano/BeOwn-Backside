export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/** Identité portée par un access token validé. */
export interface AuthenticatedPrincipal {
  sub: number;
  email: string;
  role?: string;
}

/**
 * Le seul service dont le guard HTTP a besoin. Le port est déclaré ici, côté
 * consommateur : `common/auth` ne dépend donc plus de `src/iam`, c'est IAM qui
 * fournit l'implémentation (cf. IamInfrastructureModule).
 */
export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedPrincipal>;
}
