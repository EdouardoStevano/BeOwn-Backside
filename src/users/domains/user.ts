import { TfaMethod } from './tfa-method';
import { UserEmail } from './value-objects/user-email.vo';

export class User {
  userId: number;
  firstname: string;
  lastname: string | null;
  socialId: string | null;
  password: string | null;
  userEmail: UserEmail;
  tfaMethods: TfaMethod[] = [];

  verifyEmail(): void {
    this.userEmail.verify();
  }

  isEmailVerified(): boolean {
    return this.userEmail.isVerified;
  }

  hasSocialLogin(): boolean {
    return this.socialId !== null;
  }
}
