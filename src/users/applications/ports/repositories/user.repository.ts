import { User } from 'src/users/domains/user';
import { UserPreferences } from 'src/users/domains/user-preferences';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  save(user: User): Promise<User>;
  findById(userId: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(user: User): Promise<User>;
  findOneBySocialId(socialId: string): Promise<User | null>;
  findPreferences(userId: number): Promise<UserPreferences>;
  savePreferences(userId: number, prefs: Partial<UserPreferences>): Promise<UserPreferences>;
}
