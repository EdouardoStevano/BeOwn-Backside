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
  findOneBySocialId(socialId: string): Promise<User | null>;
  findPreferences(userId: number): Promise<UserPreferences>;
  savePreferences(
    userId: number,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences>;
}
