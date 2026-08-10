import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailAlreadyRegisteredError } from 'src/iam/domains/errors';
import { SendEmailVerificationUseCase } from 'src/iam/applications/email-verification/usecases/send-email-verification.usecase';
import { UserFactory } from 'src/iam/domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { User } from 'src/iam/domains/models/user';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/**
 * Entrée du sign-up, exprimée par la couche applicative.
 *
 * Volontairement pas le `SignUpDto` de `presenters/` : un usecase ne dépend pas
 * d'un DTO HTTP (§12.5 pris à l'envers). Le contrôleur valide son DTO puis
 * passe une structure nue.
 */
export interface RegisterInput {
  firstname: string;
  lastname?: string;
  email: string;
  password: string;
}

/**
 * Inscription d'un nouvel utilisateur.
 *
 * Rattaché à la feature `authentication` et non à `users` : le sign-up est un
 * flux d'authentification, exposé par `POST /auth/sign-up`.
 *
 * Le compte naît CREE, puis le lien de vérification d'adresse part
 * automatiquement dans la foulée (token à usage unique, cf.
 * SendEmailVerificationUseCase) ; c'est `GET /email/verify?token=…` qui fera
 * ensuite avancer CREE → EMAIL_VERIFIE. L'envoi est volontairement délégué au
 * use case de la feature `email-verification` plutôt que réimplémenté ici :
 * une seule façon d'émettre un lien de vérification dans toute l'app, que la
 * demande vienne du sign-up ou de `POST /email/send-verification`.
 */
@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly notificationEvents: NotificationEventService,
    private readonly sendEmailVerificationUseCase: SendEmailVerificationUseCase,
  ) {}

  async execute(registerDto: RegisterInput): Promise<User> {
    const existing = await this.userRepository.findByEmail(registerDto.email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
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

    // Le compte est créé (CREE) que cet envoi aboutisse ou non : une panne du
    // fournisseur d'emails ne doit jamais faire échouer une inscription déjà
    // persistée. En cas d'échec on se contente de logger — l'utilisateur peut
    // redemander un lien via POST /email/send-verification.
    try {
      await this.sendEmailVerificationUseCase.execute(savedUser.email);
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi du lien de vérification à ${registerDto.email} lors du sign-up — l'utilisateur pourra le redemander via /email/send-verification.`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    return savedUser;
  }
}
