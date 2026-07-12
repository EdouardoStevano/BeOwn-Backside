import { Inject, Injectable } from '@nestjs/common';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { User } from 'src/users/domains/user';
import {
  EmailAlreadyInUseError,
  UserNotFoundError,
} from 'src/users/domains/errors/user.errors';
import {
  PublicUserView,
  RegisterSocialUserInput,
  RegisterUserInput,
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
