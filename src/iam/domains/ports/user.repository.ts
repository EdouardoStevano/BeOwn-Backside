import { UserType } from 'src/iam/domains/enums/user.enum';
import { User } from 'src/iam/domains/models/user';
import { UserPreferences } from 'src/iam/domains/models/user-preferences';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

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
  findOneBySocialId(socialId: string): Promise<User | null>;
  findPreferences(userId: number): Promise<UserPreferences>;
  savePreferences(
    userId: number,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences>;
}
