import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/repositories/user.repository';
import { RegisterDto } from 'src/users/presenters/dto/user.dto';
import { User } from 'src/users/domains/user';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { SendRegistrationOtpUseCase } from 'src/iam/applications/authentication/application/usecases/send-registration-otp.usecase';

@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
    private readonly sendRegistrationOtpUseCase: SendRegistrationOtpUseCase,
  ) {}

  async execute(registerDto: RegisterDto): Promise<User> {
    const existing = await this.userRepository.findByEmail(registerDto.email);
    if (existing) {
      throw new ConflictException('Un compte avec cette email existe déjà.');
    }

    const user = await this.userFactory.create({
      firstname: registerDto.firstname,
      lastname: registerDto.lastname ?? null,
      email: registerDto.email,
      password: registerDto.password,
      socialId: null,
    });

    const savedUser = await this.userRepository.save(user);

    const fullUser = await this.userRepository.findById(savedUser.userId);
    if (fullUser) this.notificationEvents.userRegistered(fullUser);

    // The account is created CREE regardless of whether this send succeeds —
    // a mail-provider outage must never block/fail the signup response. On
    // failure we only log; the user can request a fresh code via
    // POST /auth/resend-otp.
    try {
      await this.sendRegistrationOtpUseCase.send(fullUser ?? savedUser, 'email');
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi du code d'inscription à ${registerDto.email} lors du sign-up — l'utilisateur pourra le redemander via /auth/resend-otp.`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return savedUser;
  }
}
