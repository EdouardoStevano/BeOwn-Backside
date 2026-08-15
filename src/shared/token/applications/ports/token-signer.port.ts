export const TOKEN_SIGNER = Symbol('TOKEN_SIGNER');

/**
 * Options de **signature** — volontairement réduites à ce qui varie d'un
 * token métier à l'autre. Le secret et l'émetteur n'y figurent pas : ce sont
 * des détails du driver, portés par sa configuration, pas des décisions que
 * l'appelant a à prendre.
 */
export interface TokenSignOptions {
  /** Durée de vie, en secondes. */
  expiresIn: number;
  /**
   * Audience à apposer. Absente, l'adapter applique son audience par défaut.
   * Exposée parce qu'un contexte peut vouloir cloisonner une famille de
   * tokens (voir `UNSUBSCRIBE_TOKEN_AUDIENCE` côté IAM) : c'est une décision
   * de sécurité applicative, pas un réglage du driver.
   */
  audience?: string;
}

export interface TokenVerifyOptions {
  /** Audience attendue. Absente, celle par défaut de l'adapter. */
  audience?: string;
}

/**
 * Port de base de l'émission de tokens : **signer** une charge utile,
 * **vérifier** un token. Rien d'autre.
 *
 * C'est le seul contrat qu'un changement de driver (JWT → Paseto, KMS,
 * signature asymétrique...) oblige à ré-implémenter. Les tokens métier
 * (accès, rafraîchissement, vérification d'email, désinscription) sont
 * construits **au-dessus** de ce port, dans la couche application du contexte
 * qui les émet — les redéfinir dans chaque adapter dupliquerait à l'identique
 * des règles qui n'ont rien de technique (TTL, claims, cloisonnement
 * d'audience, usage unique).
 *
 * L'implémentation doit **rejeter** (promesse rompue) tout token dont la
 * signature, l'émetteur, l'audience ou l'expiration ne conviennent pas — les
 * appelants s'appuient sur ce contrat pour transformer l'échec en erreur
 * métier (LSP, §4).
 */
export interface TokenSigner {
  sign<TPayload extends object>(
    payload: TPayload,
    options: TokenSignOptions,
  ): Promise<string>;

  verify<TPayload extends object>(
    token: string,
    options?: TokenVerifyOptions,
  ): Promise<TPayload>;
}
