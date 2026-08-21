import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  asUniqueViolation,
  isEmailUniqueViolation,
} from 'src/common/persistence/unique-violation';
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

    const savedUser = await this.saveOrTranslateConflict(user, registerDto.email);

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

  /**
   * ANO-01 — enregistre l'utilisateur en traduisant toute violation de
   * contrainte d'unicité en réponse exploitable.
   *
   * Deux causes distinctes, deux messages :
   *  - l'adresse e-mail est déjà prise : la vérification préalable
   *    (`findByEmail`) laisse passer les inscriptions CONCURRENTES sur la même
   *    adresse ; seule la contrainte en base tranche. Même message que la
   *    vérification préalable, pour ne pas exposer deux formulations ;
   *  - une autre contrainte saute — typiquement la clé primaire de
   *    `user_emails` quand la séquence Postgres a été désynchronisée par un
   *    insert SQL manuel (cause racine constatée en QA). Ce n'est pas une
   *    erreur de saisie : l'utilisateur reçoit une invitation à réessayer, et
   *    l'exploitation reçoit un log d'erreur NOMMANT la contrainte.
   *
   * Dans les deux cas, ni le SQL, ni le `detail` Postgres (qui contient la
   * valeur en conflit) ne sortent vers le client.
   */
  private async saveOrTranslateConflict(
    user: User,
    email: string,
  ): Promise<User> {
    try {
      return await this.userRepository.save(user);
    } catch (err) {
      const violation = asUniqueViolation(err);
      if (!violation) throw err;

      if (isEmailUniqueViolation(violation)) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          code: 'EMAIL_ALREADY_USED',
          message: 'Un compte avec cette email existe déjà.',
        });
      }

      this.logger.error(
        `Inscription impossible : violation d'unicité inattendue sur la contrainte ` +
          `"${violation.constraint ?? 'inconnue'}". Cause probable : séquence Postgres ` +
          `désynchronisée après un insert SQL manuel — réaligner avec setval (cf. ` +
          `docs/testing/environnement-local.md, section Reset).`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'REGISTRATION_CONFLICT',
        message:
          "Votre inscription n'a pas pu être enregistrée. Merci de réessayer dans quelques instants.",
      });
    }
  }
}
