/**
 * Détection des violations de contrainte d'unicité Postgres (SQLSTATE 23505).
 *
 * Pourquoi un helper plutôt qu'un `instanceof QueryFailedError` en ligne :
 *  - la forme de l'erreur diffère selon le chemin (erreur TypeORM enveloppée,
 *    erreur pilote `pg` brute, erreur relayée par un `QueryRunner`) — le code
 *    se trouve tantôt sur `err.code`, tantôt sur `err.driverError.code` ;
 *  - le contenu (`constraint`, `detail`) contient la valeur en conflit et ne
 *    doit JAMAIS être renvoyé au client ; l'isoler ici rend explicite ce qui
 *    reste côté serveur ;
 *  - fonction pure, testable sans base de données ni TypeORM.
 */
export const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface UniqueViolation {
  /** Nom de la contrainte violée, tel que renvoyé par Postgres. */
  constraint: string | null;
  /** Détail Postgres — contient la VALEUR en conflit : usage interne seulement. */
  detail: string | null;
}

const readCode = (err: any): string | undefined =>
  err?.code ?? err?.driverError?.code ?? err?.originalError?.code;

/**
 * Renvoie les informations de la violation d'unicité, ou `null` si l'erreur
 * n'en est pas une (l'appelant doit alors relancer l'erreur telle quelle).
 */
export function asUniqueViolation(err: unknown): UniqueViolation | null {
  if (!err || typeof err !== 'object') return null;
  if (readCode(err) !== POSTGRES_UNIQUE_VIOLATION) return null;

  const source: any = err;
  const driver = source.driverError ?? source.originalError ?? source;
  return {
    constraint: driver?.constraint ?? source?.constraint ?? null,
    detail: driver?.detail ?? source?.detail ?? null,
  };
}

/**
 * Vrai si la violation porte sur l'adresse e-mail (contrainte ou détail la
 * nommant), par opposition à une violation de clé primaire — typiquement une
 * séquence Postgres désynchronisée après un insert SQL manuel, qui n'a rien à
 * voir avec les données envoyées par l'utilisateur.
 */
export function isEmailUniqueViolation(violation: UniqueViolation): boolean {
  const haystack = `${violation.constraint ?? ''} ${violation.detail ?? ''}`.toLowerCase();
  return haystack.includes('email');
}
