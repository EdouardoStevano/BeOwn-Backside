import { User, UserSnapshot } from './user';
import { MfaMethod } from './mfa-method';
import { UserMapper } from 'src/iam/domains/mappers/user.mapper';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
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

/**
 * Facteur MFA tel que la persistance le rend — identifiant compris.
 *
 * Les specs ne peuvent plus le fabriquer autrement : `MfaMethod.enroler` ne
 * produit qu'un facteur en attente et sans id, et l'activation passe par le
 * compte. C'est exactement ce que garantit l'agrégat.
 */
export const buildFacteur = (
  overrides: {
    id?: number;
    method?: MfaMethodType;
    isActive?: boolean;
    credential?: string;
  } = {},
): MfaMethod =>
  MfaMethod.rehydrate({
    id: overrides.id ?? 1,
    method: overrides.method ?? MfaMethodType.EMAIL,
    isActive: overrides.isActive ?? true,
    credential: overrides.credential ?? 'user@example.com',
  });
