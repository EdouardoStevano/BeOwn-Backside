import { Repository } from 'typeorm';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { UserMapper } from 'src/iam/infrastructure/persistence/mappers/user.mapper';
import { UserTypeOrmRepository } from './user.repository';

/**
 * Régression observée en dev : `PATCH /users/me/type` → 500
 * « duplicate key … REL_2e88b9… » sur `INSERT INTO user_emails`.
 *
 * `user_emails.userId` est une séquence propre à la table : elle ne vaut l'id
 * du compte que par coïncidence, et diverge dès qu'une ligne est insérée hors
 * application (comptes de rôles clonés en SQL — cf. ANO-01). Le save() en
 * cascade doit donc reprendre la clé RÉELLE de la ligne existante, sinon
 * TypeORM insère un doublon et heurte l'unicité de `user_id`.
 */
const buildEntity = (userId: number, emailRowId: number): UserEntity => {
  const entity = new UserEntity();
  entity.userId = userId;
  entity.firstname = 'Jean';
  entity.lastname = null;
  entity.socialId = null;
  entity.password = 'hashed';
  entity.role = UserRole.INVESTISSEUR;
  entity.status = UserStatus.ACTIF;
  entity.cguAccepteesLe = null;
  entity.lastLoginAt = null;
  entity.createdAt = new Date('2026-01-01T00:00:00Z');
  entity.updatedAt = new Date('2026-01-01T00:00:00Z');

  const email = new UserEmailEntity();
  email.userId = emailRowId;
  email.email = 'user@example.com';
  email.isVerified = true;
  email.verifiedDate = new Date('2026-01-02T00:00:00Z');
  entity.userEmail = email;
  return entity;
};

describe('UserTypeOrmRepository.update — clé de la ligne user_emails', () => {
  const setup = (existing: UserEntity | null) => {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (e: UserEntity) => e),
    } as unknown as Repository<UserEntity>;
    const prefsRepository = {} as Repository<UserPreferencesEntity>;
    return {
      repo: new UserTypeOrmRepository(usersRepository, prefsRepository),
      usersRepository,
    };
  };

  it('reprend la clé réelle de la ligne email existante (≠ id du compte)', async () => {
    // Compte 27 dont la ligne user_emails porte la clé 21 (séquences divergées).
    const { repo, usersRepository } = setup(buildEntity(27, 21));
    const domain = UserMapper.toDomain(buildEntity(27, 21));

    await repo.update(domain);

    const saved = (usersRepository.save as jest.Mock).mock.calls[0][0] as UserEntity;
    expect(saved.userId).toBe(27);
    expect(saved.userEmail.userId).toBe(21);
    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 27 },
      relations: ['userEmail'],
    });
  });

  it("n'invente pas de clé quand le compte n'a pas encore de ligne email", async () => {
    const existing = buildEntity(27, 21);
    (existing as { userEmail?: UserEmailEntity }).userEmail = undefined;
    const { repo, usersRepository } = setup(existing);
    const domain = UserMapper.toDomain(buildEntity(27, 21));

    await repo.update(domain);

    const saved = (usersRepository.save as jest.Mock).mock.calls[0][0] as UserEntity;
    // Sans ligne existante, l'INSERT en cascade est légitime : clé générée.
    expect(saved.userEmail.userId).toBeUndefined();
  });
});
