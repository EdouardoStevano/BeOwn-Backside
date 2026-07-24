import { TfaMethod } from './tfa-method';
import { UserEmail } from './value-objects/user-email.vo';
import {
  UserRole,
  UserStatus,
} from 'src/users/infrastructure/persistences/entities/user.entity';

export { UserRole, UserStatus };

export class User {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  password: string | null;
  role: UserRole;
  status: UserStatus;
  cguAccepteesLe: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: UserEmail;
  tfaMethods: TfaMethod[] = [];
}
