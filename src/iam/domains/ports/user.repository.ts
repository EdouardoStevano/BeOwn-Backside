import { User } from 'src/iam/domains/models/user';

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
  /**
   * Lecture en lot, pour les listes qui affichent le titulaire à côté de leur
   * propre donnée (liste KYC du back-office, par exemple).
   *
   * Existe pour que ces contextes n'aient pas à joindre `UserEntity` en base :
   * ils tiennent des identifiants, ils demandent les comptes correspondants par
   * ce port. Sans lot, la même liste ferait N appels à `findById`.
   *
   * L'ordre du résultat n'est pas garanti et les identifiants inconnus sont
   * simplement absents — l'appelant indexe par `userId`.
   */
  findManyByIds(userIds: number[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  update(user: User): Promise<User>;
  findOneBySocialId(socialId: string): Promise<User | null>;
}
