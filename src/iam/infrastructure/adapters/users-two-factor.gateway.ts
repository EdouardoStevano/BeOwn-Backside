import { Inject, Injectable } from '@nestjs/common';
import {
  USER_ACCOUNT_SERVICE,
  type UserAccountService,
  type TwoFactorEnrollmentView,
} from 'src/users/applications/contracts/user-account.contract';
import { TwoFactorMethod as UsersTwoFactorMethod } from 'src/users/domains/enums/user.enum';
import {
  TwoFactorEnrollment,
  TwoFactorGateway,
  TwoFactorMethod,
} from 'src/iam/domain/ports/two-factor.gateway';

/**
 * Anti-corruption layer du second facteur, pendant de UsersAccountGateway.
 *
 * Les deux enums de canal ont les mêmes valeurs aujourd'hui ; la traduction est
 * quand même explicite, pour que le jour où l'un des deux contextes en ajoute un
 * (WebAuthn côté IAM, par exemple) le compilateur désigne ce fichier.
 */
@Injectable()
export class UsersTwoFactorGateway implements TwoFactorGateway {
  constructor(
    @Inject(USER_ACCOUNT_SERVICE)
    private readonly userAccounts: UserAccountService,
  ) {}

  async findActive(email: string): Promise<TwoFactorEnrollment | null> {
    const view = await this.userAccounts.findActiveTwoFactor(email);
    return view ? UsersTwoFactorGateway.toEnrollment(view) : null;
  }

  async findEnrollment(
    accountId: number,
    method: TwoFactorMethod,
  ): Promise<TwoFactorEnrollment | null> {
    const view = await this.userAccounts.findTwoFactorEnrollment(
      accountId,
      UsersTwoFactorGateway.toUsersMethod(method),
    );
    return view ? UsersTwoFactorGateway.toEnrollment(view) : null;
  }

  startEnrollment(
    accountId: number,
    method: TwoFactorMethod,
    credential: string,
  ): Promise<void> {
    return this.userAccounts.startTwoFactorEnrollment(
      accountId,
      UsersTwoFactorGateway.toUsersMethod(method),
      credential,
    );
  }

  activate(accountId: number, method: TwoFactorMethod): Promise<void> {
    return this.userAccounts.activateTwoFactor(
      accountId,
      UsersTwoFactorGateway.toUsersMethod(method),
    );
  }

  disable(accountId: number): Promise<void> {
    return this.userAccounts.disableTwoFactor(accountId);
  }

  private static toEnrollment(
    view: TwoFactorEnrollmentView,
  ): TwoFactorEnrollment {
    return {
      method: UsersTwoFactorGateway.toIamMethod(view.method),
      credential: view.credential,
      isActive: view.isActive,
    };
  }

  private static toIamMethod(method: UsersTwoFactorMethod): TwoFactorMethod {
    switch (method) {
      case UsersTwoFactorMethod.EMAIL:
        return TwoFactorMethod.EMAIL;
      case UsersTwoFactorMethod.SMS:
        return TwoFactorMethod.SMS;
      case UsersTwoFactorMethod.TOTP:
        return TwoFactorMethod.TOTP;
    }
  }

  private static toUsersMethod(method: TwoFactorMethod): UsersTwoFactorMethod {
    switch (method) {
      case TwoFactorMethod.EMAIL:
        return UsersTwoFactorMethod.EMAIL;
      case TwoFactorMethod.SMS:
        return UsersTwoFactorMethod.SMS;
      case TwoFactorMethod.TOTP:
        return UsersTwoFactorMethod.TOTP;
    }
  }
}
