import { UserRole, UserStatus, UserType } from 'src/iam/domains/enums/user.enum';
import { User } from 'src/iam/domains/models/user';
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
    // Le lien vers le compte, mais AUCUNE clé présumée pour la ligne email :
    // `user_emails.userId` est une séquence propre, qui ne vaut pas l'id du
    // compte dès qu'une ligne a été insérée hors application. La poser ici
    // faisait insérer un doublon (violation d'unicité sur `user_id`) ; c'est le
    // repository qui relit la clé réelle avant le save().
    expect(entity.userEmail.userId).toBeUndefined();
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

/**
 * `role` n'était PAS mappé vers l'entité : toute écriture passant par
 * `UserRepository.update()` reconstruisait une ligne sans rôle. La valeur en
 * base survivait par accident (TypeORM ignore les colonnes `undefined`), mais
 * rien ne le garantissait — et un porteur ou un administrateur pouvait, sur un
 * simple changement du comportement de l'ORM, retomber au rôle par défaut.
 */
describe('UserMapper (persistance) — rôle et type de compte', () => {
  const buildEntityWithRole = (role: UserRole): UserEntity => {
    const entity = buildEntity();
    entity.role = role;
    return entity;
  };

  it('relit le rôle depuis la ligne', () => {
    const domain = UserMapper.toDomain(buildEntityWithRole(UserRole.PORTEUR));

    expect(domain.role).toBe(UserRole.PORTEUR);
  });

  it('réécrit le rôle dans la ligne (aller-retour sans perte)', () => {
    const domain = UserMapper.toDomain(
      buildEntityWithRole(UserRole.SUPER_ADMIN),
    );

    const entity = UserMapper.toEntity(domain);

    expect(entity.role).toBe(UserRole.SUPER_ADMIN);
  });

  it('ne laisse jamais le rôle indéfini au save()', () => {
    // La régression exacte : `entity.role` valait `undefined`, donc la colonne
    // était absente de l'UPDATE et le rôle de l'agrégat n'atteignait pas la base.
    const entity = UserMapper.toEntity(
      UserMapper.toDomain(buildEntityWithRole(UserRole.CGP)),
    );

    expect(entity.role).toBeDefined();
    expect(entity.role).not.toBe(UserRole.INVESTISSEUR);
  });

  it('conserve le rôle à travers une transition métier du compte', () => {
    const domain = UserMapper.toDomain(buildEntityWithRole(UserRole.PORTEUR));

    domain.markEmailAsVerified();
    const entity = UserMapper.toEntity(domain);

    expect(entity.role).toBe(UserRole.PORTEUR);
    expect(entity.status).toBe(UserStatus.ACTIF);
  });

  it("n'écrit PAS `userType` : le champ n'appartient pas à l'agrégat", () => {
    // Décision assumée : la source de vérité du type de compte est la présence
    // d'un profil PP ou PM ; la colonne ne garde que la déclaration faite à
    // l'onboarding, écrite par `UserRepository.updateUserType()`. Un mapping
    // ici reposerait une propriété fantôme sur le modèle de domaine.
    const source = buildEntity();
    source.userType = UserType.PM;

    const entity = UserMapper.toEntity(UserMapper.toDomain(source));

    // `undefined` et non `null` : TypeORM ignore la colonne, donc la valeur
    // déjà en base est laissée intacte au lieu d'être écrasée.
    expect(entity.userType).toBeUndefined();
  });
});
