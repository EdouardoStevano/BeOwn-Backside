import { UserRole, UserStatus } from 'src/iam/domain/enums/user.enum';
import { User } from 'src/iam/domain/aggregates/user';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { UserMapper } from './user.mapper';

const VERIFIED_AT = new Date('2026-02-03T10:00:00Z');

const buildEntity = (
  emailOverrides: Partial<UserEmailEntity> | null = {},
): UserEntity => {
  const entity = new UserEntity();
  entity.userId = 42;
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

  if (emailOverrides !== null) {
    const email = new UserEmailEntity();
    email.userId = 42;
    email.email = 'user@example.com';
    email.isVerified = false;
    email.verifiedDate = null;
    Object.assign(email, emailOverrides);
    entity.userEmail = email;
  }

  return entity;
};

/**
 * L'adresse et son état de vérification vivent dans l'agrégat, mais restent
 * stockés dans `user_emails` : c'est exactement la couture que ce mapper tient
 * (§12.7). Une régression ici ne se voit pas au type-check — elle se voit en
 * base, une adresse plus tard.
 */
describe('UserMapper (persistance) — couture user_emails ↔ agrégat', () => {
  it("relit l'adresse et son état de vérification depuis deux tables", () => {
    const domain = UserMapper.toDomain(
      buildEntity({ isVerified: true, verifiedDate: VERIFIED_AT }),
    );

    expect(domain.email).toBe('user@example.com');
    expect(domain.isEmailVerified()).toBe(true);
    expect(domain.emailVerifiedDate).toEqual(VERIFIED_AT);
  });

  it('réécrit la ligne user_emails depuis les champs de l’agrégat', () => {
    const domain = UserMapper.toDomain(buildEntity());

    domain.markEmailAsVerified();
    const entity = UserMapper.toEntity(domain);

    expect(entity.userEmail.email).toBe('user@example.com');
    expect(entity.userEmail.isVerified).toBe(true);
    expect(entity.userEmail.verifiedDate).toBeInstanceOf(Date);
    // Le lien des deux côtés : sans `userId`, TypeORM insère une ligne
    // orpheline plutôt que de mettre à jour celle du compte.
    expect(entity.userEmail.userId).toBe(42);
    expect(entity.userEmail.user).toBe(entity);
  });

  it('relit sans broncher un compte dont l’adresse ne satisfait plus la règle', () => {
    // Reconstitution par `Email.restore` : refuser au chargement rendrait le
    // compte inaccessible, y compris pour corriger l'adresse fautive.
    const domain = UserMapper.toDomain(
      buildEntity({ email: 'adresse-heritee-sans-arobase' }),
    );

    expect(domain.email).toBe('adresse-heritee-sans-arobase');
  });

  it("n'invente pas de ligne user_emails quand le compte n'en a pas", () => {
    const domain: User = UserMapper.toDomain(buildEntity(null));

    expect(domain.email).toBe('');
    expect(domain.isEmailVerified()).toBe(false);
    expect(UserMapper.toEntity(domain).userEmail).toBeUndefined();
  });
});
