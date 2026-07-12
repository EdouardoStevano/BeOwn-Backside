import { Inject, Injectable } from '@nestjs/common';
import {
  USER_ACCOUNT_SERVICE,
  type UserAccountService,
  type UserAccountSnapshot,
} from 'src/users/applications/contracts/user-account.contract';
import { EmailAlreadyInUseError } from 'src/users/domains/errors/user.errors';
import { AuthAccount } from 'src/iam/domain/models/auth-account';
import { AccountAlreadyExistsError } from 'src/iam/domain/errors/iam.errors';
import {
  AccountGateway,
  RegisterAccountInput,
  RegisterSocialAccountInput,
} from 'src/iam/domain/ports/account.gateway';

/**
 * Anti-corruption layer : l'unique traduction entre le contexte IAM et le
 * contexte Users.
 *
 * C'est le seul fichier d'IAM qui importe quoi que ce soit de `src/users`, et
 * il n'en importe que le contrat publié. Si Users réorganise son agrégat, son
 * repository ou son hachage, seul ce fichier bouge.
 */
@Injectable()
export class UsersAccountGateway implements AccountGateway {
  constructor(
    @Inject(USER_ACCOUNT_SERVICE)
    private readonly userAccounts: UserAccountService,
  ) {}

  async findByEmail(email: string): Promise<AuthAccount | null> {
    const snapshot = await this.userAccounts.findByEmail(email);
    return snapshot ? UsersAccountGateway.toAuthAccount(snapshot) : null;
  }

  async findBySocialId(socialId: string): Promise<AuthAccount | null> {
    const snapshot = await this.userAccounts.findBySocialId(socialId);
    return snapshot ? UsersAccountGateway.toAuthAccount(snapshot) : null;
  }

  async register(input: RegisterAccountInput): Promise<unknown> {
    return this.translateConflict(() => this.userAccounts.register(input));
  }

  async registerSocial(
    input: RegisterSocialAccountInput,
  ): Promise<AuthAccount> {
    const snapshot = await this.translateConflict(() =>
      this.userAccounts.registerSocial(input),
    );
    return UsersAccountGateway.toAuthAccount(snapshot);
  }

  /**
   * Traduit l'erreur de domaine de Users dans le vocabulaire d'IAM. C'est le
   * rôle d'une couche anti-corruption : aucune erreur étrangère ne traverse la
   * frontière telle quelle.
   */
  private async translateConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (err) {
      if (err instanceof EmailAlreadyInUseError) {
        throw new AccountAlreadyExistsError();
      }
      throw err;
    }
  }

  verifyPassword(email: string, plainPassword: string): Promise<boolean> {
    return this.userAccounts.verifyPassword(email, plainPassword);
  }

  changePassword(email: string, newPlainPassword: string): Promise<void> {
    return this.userAccounts.changePassword(email, newPlainPassword);
  }

  markEmailAsVerified(email: string): Promise<void> {
    return this.userAccounts.markEmailAsVerified(email);
  }

  private static toAuthAccount(snapshot: UserAccountSnapshot): AuthAccount {
    return new AuthAccount(
      snapshot.userId,
      snapshot.email,
      snapshot.emailVerified,
      snapshot.hasPassword,
      snapshot.role,
    );
  }
}
