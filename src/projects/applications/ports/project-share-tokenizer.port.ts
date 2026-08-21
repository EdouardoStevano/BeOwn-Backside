export const PROJECT_SHARE_TOKENIZER = Symbol('PROJECT_SHARE_TOKENIZER');

/**
 * Fabrique et vérifie les jetons de partage d'un projet.
 *
 * `ProjectController` faisait ce travail à deux endroits : lecture de
 * `process.env.PROJECT_SHARE_SECRET`, `createHash('sha256')`, troncature à
 * seize caractères et composition de l'URL à partir de
 * `process.env.FRONTEND_URL` — le tout recopié entre `getShareToken` et
 * `findByShareToken`, où une divergence d'un caractère aurait rendu tous les
 * liens invérifiables (§12.5).
 *
 * Le port ne dit rien de la construction du jeton : un condensat tronqué
 * aujourd'hui, un HMAC ou un jeton signé demain, sans que le domaine ni les use
 * cases n'aient à changer (§4, OCP).
 */
export interface ProjectShareTokenizer {
  /** Jeton opaque et stable dérivé de l'identifiant du projet. */
  tokenPour(projetId: string): string;

  /** Vrai si le jeton désigne bien ce projet. */
  correspond(token: string, projetId: string): boolean;

  /** URL publique à laquelle ce jeton donne accès. */
  urlPour(token: string): string;
}
