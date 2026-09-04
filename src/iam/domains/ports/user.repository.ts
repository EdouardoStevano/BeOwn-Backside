import { UserRole, UserType } from 'src/iam/domains/enums/user.enum';
import { User } from 'src/iam/domains/models/user';
import { UserPreferences } from 'src/iam/domains/models/user-preferences';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Le couple qui décide de l'accès à l'espace porteur, tel qu'il est EN BASE.
 *
 * Renvoyé par une lecture ciblée et non par l'agrégat : `porteurAccess`, comme
 * `userType`, n'entre pas dans le modèle de domaine `User` (cf.
 * docs/adr/ADR-role-relu-en-base-et-usertype.md § 3). Les deux champs voyagent
 * ENSEMBLE parce que la règle du double accès (D1) les lit ensemble : les
 * séparer imposerait deux allers-retours par requête gardée.
 */
export interface AccesPorteurEnBase {
  role: UserRole;
  porteurAccess: boolean;
}

export interface UserRepository {
  save(user: User): Promise<User>;
  findById(userId: number): Promise<User | null>;
  /**
   * Comme findById mais avec la colonne `password` (normalement
   * `select: false`) explicitement chargée — réservé à la vérification du mot
   * de passe (ex. suppression self-service). NE PAS utiliser findById pour
   * cela : il ne sélectionne pas le hash.
   */
  findByIdWithPassword(userId: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(user: User): Promise<User>;
  /**
   * Écrit la colonne `users.userType`, et elle seule.
   *
   * Méthode dédiée parce que `userType` n'appartient pas à l'agrégat `User` :
   * la source de vérité du type de compte est la présence d'un profil PP ou PM
   * (`GET /users/me` la déduit ainsi), la colonne ne gardant que la
   * **déclaration d'intention** faite à la première étape de l'onboarding,
   * avant que le profil n'existe. Elle passait auparavant par une propriété
   * fantôme posée sur le modèle de domaine (`(found as any).userType = …`), que
   * le mapper de persistance jetait sans bruit : `PATCH /users/me/type`
   * n'écrivait rien.
   */
  updateUserType(userId: number, userType: UserType): Promise<void>;
  /**
   * Lit `users.role` ET `users.porteurAccess` en une seule requête.
   *
   * C'est la lecture qu'exécute `PorteurAccessGuard` à CHAQUE requête sur une
   * route de l'espace porteur : l'accès porteur est une autorisation à état,
   * donc révocable, et le claim du jeton ne peut pas en tenir lieu (même
   * raisonnement que pour `role` — ADR § 1, « le claim entrant identifie, il
   * n'autorise jamais »). Modèle : `KycValidatedGuard`.
   */
  findAccesPorteur(userId: number): Promise<AccesPorteurEnBase | null>;
  /**
   * Écrit la colonne `users.porteurAccess`, et elle seule — même motif que
   * `updateUserType` : le drapeau n'appartient pas à l'agrégat `User`, il est
   * posé par la DÉCISION d'un instructeur sur une demande d'accès porteur
   * (module `porteur-access`), jamais par une édition de profil.
   */
  updatePorteurAccess(userId: number, porteurAccess: boolean): Promise<void>;
  findOneBySocialId(socialId: string): Promise<User | null>;
  findPreferences(userId: number): Promise<UserPreferences>;
  savePreferences(
    userId: number,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences>;
}
