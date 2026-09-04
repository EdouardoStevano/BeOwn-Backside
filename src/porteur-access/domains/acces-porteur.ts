/**
 * Règle du DOUBLE ACCÈS (décision fondateur D1) — domaine pur.
 *
 * Deux façons, et deux seulement, d'entrer dans l'espace porteur :
 *  1. être un porteur « pur » (`users.role = 'porteur'`) — comptes seed et
 *     attribution directe par le back-office, inchangés ;
 *  2. être un investisseur dont la demande a été ACCEPTÉE
 *     (`users.porteurAccess = true`), qui CONSERVE son rôle `investisseur`.
 *
 * Le point capital est ailleurs que dans cette fonction : la valeur qu'on lui
 * passe doit venir de la BASE, jamais du JWT. `porteurAccess` est une
 * autorisation à état, donc révocable ; l'ADR
 * `docs/adr/ADR-role-relu-en-base-et-usertype.md` pose que « le claim entrant
 * identifie, il n'autorise jamais ». Le modèle est `KycValidatedGuard`, qui
 * interroge la base à chaque requête. Recopier `porteurAccess` dans le token
 * rendrait un retrait d'accès inopérant jusqu'à l'expiration du jeton — le bug
 * exact que le lot 2 vient de corriger sur `role`.
 */

import { UserRole } from 'src/iam/domains/enums/user.enum';

/** Code stable consommé par le front pour distinguer ce refus d'un 403 générique. */
export const CODE_PORTEUR_ACCESS_REQUIS = 'PORTEUR_ACCESS_REQUIS';

/** Message affiché — contrat fixe, il ne varie pas selon la cause du refus. */
export const MESSAGE_PORTEUR_ACCESS_REQUIS =
  "Espace porteur non ouvert sur ce compte — demandez l'accès porteur depuis votre espace.";

/**
 * Le compte peut-il accéder aux routes de l'espace porteur ?
 *
 * @param role rôle LU EN BASE (pas le claim du token)
 * @param porteurAccess drapeau LU EN BASE
 */
export function peutAccederEspacePorteur(
  role: UserRole | string | null | undefined,
  porteurAccess: boolean | null | undefined,
): boolean {
  return role === UserRole.PORTEUR || porteurAccess === true;
}

/**
 * Le compte peut-il DEMANDER l'accès porteur ?
 *
 * Un porteur « pur » n'a rien à demander, et le back-office non plus : la
 * demande est le parcours de l'investisseur, et de lui seul.
 */
export function peutDemanderAccesPorteur(
  role: UserRole | string | null | undefined,
): boolean {
  return role === UserRole.INVESTISSEUR;
}
