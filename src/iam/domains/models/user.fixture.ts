import { User, UserSnapshot } from './user';
import { UserMapper } from 'src/iam/domains/mappers/user.mapper';
import { UserRole, UserStatus } from 'src/iam/domains/enums/user.enum';

/**
 * Builder réservé aux tests (exclu du build — cf. tsconfig.build.json).
 *
 * L'état de `User` étant privé, les specs ne peuvent plus assembler un compte
 * champ par champ ; elles passent par `UserMapper.restore`, comme la persistance.
 * Ce helper évite d'écrire les douze champs du snapshot dans chaque spec.
 */
export const buildUser = (
  overrides: Partial<UserSnapshot> & {
    email?: string;
    emailVerified?: boolean;
  } = {},
): User => {
  const {
    email = 'user@example.com',
    emailVerified = false,
    ...snapshot
  } = overrides;

  return UserMapper.restore({
    userId: 42,
    firstname: 'Jean',
    lastname: null,
    socialId: null,
    passwordHash: 'hashed-password',
    role: UserRole.INVESTISSEUR,
    status: UserStatus.ACTIF,
    userType: null,
    telephone: null,
    cguAccepteesLe: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    email,
    emailVerified,
    emailVerifiedDate: emailVerified ? new Date('2026-01-01T00:00:00Z') : null,
    ...snapshot,
  });
};
