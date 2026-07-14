import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import {
  TFA_REPOSITORY,
  type TfaRepository,
} from '../ports/repositories/tfa.repository';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { User } from 'src/users/domains/user';
import { TfaMethod, createTfaMethod } from 'src/users/domains/tfa-method';
import { TwoFactorMethod } from 'src/users/domains/enums/user.enum';
import {
  EmailAlreadyInUseError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import {
  PublicUserView,
  RegisterSocialUserInput,
  RegisterUserInput,
  TwoFactorEnrollmentView,
  UserAccountService,
  UserAccountSnapshot,
} from '../contracts/user-account.contract';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/**
 * Implémentation du contrat publié de Users (cf. user-account.contract.ts).
 *
 * C'est le service applicatif que les autres contextes appellent. Il orchestre
 * l'agrégat, le repository et le port de hachage ; les appelants n'en voient rien.
 */
@Injectable()
export class UsersAccountService implements UserAccountService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TFA_REPOSITORY) private readonly tfaRepository: TfaRepository,
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
    private readonly userFactory: UserFactory,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async findByEmail(email: string): Promise<UserAccountSnapshot | null> {
    const user = await this.userRepository.findByEmail(email);
    return user ? UsersAccountService.toSnapshot(user) : null;
  }

  async findBySocialId(socialId: string): Promise<UserAccountSnapshot | null> {
    const user = await this.userRepository.findOneBySocialId(socialId);
    return user ? UsersAccountService.toSnapshot(user) : null;
  }

  async register(input: RegisterUserInput): Promise<PublicUserView> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyInUseError();
    }

    const user = await this.userFactory.create({
      firstname: input.firstname,
      lastname: input.lastname,
      email: input.email,
      password: input.password,
      socialId: null,
    });

    const saved = await this.userRepository.save(user);

    // Rechargé avec ses relations : la notification a besoin de l'email complet.
    // `void` : l'envoi est volontairement en fire-and-forget, une notification
    // qui échoue ne doit pas faire échouer l'inscription.
    const full = await this.userRepository.findById(saved.userId);
    if (full) void this.notificationEvents.userRegistered(full);

    return UsersAccountService.toPublicView(saved);
  }

  async registerSocial(
    input: RegisterSocialUserInput,
  ): Promise<UserAccountSnapshot> {
    const user = await this.userFactory.create({
      firstname: input.firstname,
      lastname: input.lastname,
      email: input.email,
      socialId: input.socialId,
      password: null,
      // Le fournisseur OAuth a déjà prouvé la possession de l'adresse.
      emailVerified: true,
    });

    const saved = await this.userRepository.save(user);
    return UsersAccountService.toSnapshot(saved);
  }

  async verifyPassword(email: string, plainPassword: string): Promise<boolean> {
    const user = await this.userRepository.findByEmail(email);
    if (!user?.hasPassword) return false;

    return this.hashingService.compare(plainPassword, user.password!);
  }

  async changePassword(email: string, newPlainPassword: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UserNotFoundError();

    user.changePassword(await this.hashingService.hash(newPlainPassword));
    await this.userRepository.update(user);
  }

  async markEmailAsVerified(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new UserNotFoundError();

    user.verifyEmail();
    await this.userRepository.update(user);
  }

  // ─── Second facteur ────────────────────────────────────────────────────────

  async findActiveTwoFactor(
    email: string,
  ): Promise<TwoFactorEnrollmentView | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const prefs = await this.userRepository.findPreferences(user.userId);
    if (!prefs.twoFactorMethod) return null;

    // La préférence dit quel canal ; le canal doit encore avoir été confirmé.
    // Une incohérence entre les deux (donnée corrompue, migration ratée) se
    // traduit par « pas de 2FA » plutôt que par un compte inaccessible.
    const method = await this.tfaRepository.findOne(
      user.userId,
      prefs.twoFactorMethod,
    );
    if (!method?.isActive) return null;

    return UsersAccountService.toEnrollmentView(method);
  }

  async findTwoFactorEnrollment(
    userId: number,
    method: TwoFactorMethod,
  ): Promise<TwoFactorEnrollmentView | null> {
    const enrolled = await this.tfaRepository.findOne(userId, method);
    return enrolled ? UsersAccountService.toEnrollmentView(enrolled) : null;
  }

  async startTwoFactorEnrollment(
    userId: number,
    method: TwoFactorMethod,
    credential: string,
  ): Promise<void> {
    await this.tfaRepository.upsert(
      userId,
      createTfaMethod(method, credential),
    );
  }

  async activateTwoFactor(
    userId: number,
    method: TwoFactorMethod,
  ): Promise<void> {
    await this.tfaRepository.activateOnly(userId, method);
    await this.userRepository.savePreferences(userId, {
      twoFactorMethod: method,
    });
  }

  async disableTwoFactor(userId: number): Promise<void> {
    await this.tfaRepository.deactivateAll(userId);
    await this.userRepository.savePreferences(userId, {
      twoFactorMethod: null,
    });
  }

  private static toEnrollmentView(method: TfaMethod): TwoFactorEnrollmentView {
    return {
      method: method.method,
      credential: method.credential,
      isActive: method.isActive,
    };
  }

  private static toSnapshot(user: User): UserAccountSnapshot {
    return {
      userId: user.userId,
      email: user.userEmail.email,
      emailVerified: user.isEmailVerified,
      role: user.role,
      status: user.status,
      hasPassword: user.hasPassword,
    };
  }

  static toPublicView(user: User): PublicUserView {
    return {
      userId: user.userId,
      firstname: user.firstname,
      lastname: user.lastname,
      socialId: user.socialId,
      role: user.role,
      status: user.status,
      userType: user.userType ?? null,
      cguAccepteesLe: user.cguAccepteesLe,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      userEmail: {
        email: user.userEmail.email,
        isVerified: user.userEmail.isVerified,
        verifiedDate: user.userEmail.verifiedDate,
      },
      tfaMethods: user.tfaMethods ?? [],
    };
  }
}
