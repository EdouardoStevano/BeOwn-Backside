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

import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import type { PublicUserAccesPorteur } from 'src/iam/domains/mappers/user.mapper';
import type { AccesPorteurEnBase } from 'src/iam/domains/ports/user.repository';

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

/**
 * Projection PUBLIABLE de l'accès porteur, à partir de ce qui a été lu en base.
 *
 * Écrite ICI, dans le module qui détient la règle du double accès, et non dans
 * IAM : ce que le front doit lire n'est pas le drapeau brut — il vaut `false`
 * sur les comptes porteurs « purs », qui ont pourtant l'espace ouvert. La seule
 * réponse juste est celle de `peutAccederEspacePorteur`, et il n'existe qu'une
 * façon de la calculer.
 *
 * `null` (compte introuvable, lecture en échec) donne un accès FERMÉ : en
 * matière d'autorisation, l'absence d'information ne vaut jamais permission.
 */
export function projeterAccesPorteur(
  acces: Pick<AccesPorteurEnBase, 'role' | 'porteurAccess'> | null | undefined,
): PublicUserAccesPorteur {
  return {
    porteurAccess: acces?.porteurAccess === true,
    espacePorteurOuvert: peutAccederEspacePorteur(
      acces?.role,
      acces?.porteurAccess,
    ),
  };
}

/**
 * Le compte demandeur est-il en état de recevoir une décision ?
 *
 * Miroir PUR de `User.canOpenSession()` — un compte suspendu, clos ou supprimé
 * n'est pas décidable (`CompteInactifError`, 409). Ce doublon existe parce que
 * la file d'instruction n'a pas d'agrégat `User` sous la main : elle liste des
 * dossiers et ne connaît de leur titulaire que le statut lu en base. Un test de
 * PARITÉ (`acces-porteur.spec.ts`) rejoue les deux sur tous les statuts et
 * échoue à la première divergence — la duplication est donc bornée, pas subie.
 *
 * `null` (compte introuvable) est traité comme non décidable : on ne tranche
 * pas le dossier de quelqu'un qui n'existe plus.
 */
export function compteDecidable(
  statut: UserStatus | string | null | undefined,
): boolean {
  return (
    statut === UserStatus.CREE ||
    statut === UserStatus.EMAIL_VERIFIE ||
    statut === UserStatus.ACTIF
  );
}
