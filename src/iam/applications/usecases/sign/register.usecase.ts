import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  EmailAlreadyRegisteredError,
  RegistrationConflictError,
} from 'src/iam/domains/errors';
import {
  asUniqueViolation,
  isEmailUniqueViolation,
} from 'src/common/persistence/unique-violation';
import { UserFactory } from '../../../domains/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { User } from 'src/iam/domains/models/user';
import { UserRegisteredDomainEvent } from 'src/iam/domains/events/user-registered.domain-event';

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
 * Le compte naît CREE ; c'est `GET /auth/email/verify?token=…` qui le fera
 * ensuite avancer CREE → EMAIL_VERIFIE.
 *
 * Ce use case ne fait que ça : créer le compte, puis lever
 * `UserRegisteredDomainEvent`. Tout ce qui suit une inscription sans la
 * conditionner appartient aux abonnés (§8) — l'envoi du lien de vérification
 * comme la notification des administrateurs, tous deux dans
 * `UserRegisteredEventHandler`. S'inscrire réussit ou échoue sur la seule
 * question de savoir si le compte a pu être créé.
 */
@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
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

    const savedUser = await this.saveOrTranslateConflict(user);

    // Le fait est annoncé, les réactions ne sont pas orchestrées ici : qui
    // veut être prévenu d'une inscription s'abonne (§8). Publié après la
    // sauvegarde uniquement — un abonné ne doit pas réagir à un compte qui
    // n'existe pas.
    this.eventBus.publish(
      new UserRegisteredDomainEvent(
        savedUser.userId,
        savedUser.email,
        savedUser.firstname,
      ),
    );

    return savedUser;
  }

  /**
   * ANO-01 — enregistre l'utilisateur en traduisant toute violation de
   * contrainte d'unicité en erreur métier exploitable.
   *
   * Deux causes distinctes, deux erreurs :
   *  - l'adresse e-mail est déjà prise : la vérification préalable
   *    (`findByEmail`) laisse passer les inscriptions CONCURRENTES sur la même
   *    adresse ; seule la contrainte en base tranche. On lève la même erreur
   *    que la vérification préalable, pour ne pas exposer deux formulations ;
   *  - une autre contrainte saute — typiquement la clé primaire de
   *    `user_emails` quand la séquence Postgres a été désynchronisée par un
   *    insert SQL manuel. Ce n'est pas une erreur de saisie : l'utilisateur
   *    reçoit une invitation à réessayer et l'exploitation un log NOMMANT la
   *    contrainte.
   *
   * Ni le SQL, ni le `detail` Postgres (qui contient la valeur en conflit) ne
   * sortent vers le client : `IamErrorFilter` ne rend que message et code.
   */
  private async saveOrTranslateConflict(user: User): Promise<User> {
    try {
      return await this.userRepository.save(user);
    } catch (err) {
      const violation = asUniqueViolation(err);
      if (!violation) throw err;

      if (isEmailUniqueViolation(violation)) {
        throw new EmailAlreadyRegisteredError();
      }

      this.logger.error(
        `Inscription impossible : violation d'unicité inattendue sur la contrainte ` +
          `"${violation.constraint ?? 'inconnue'}". Cause probable : séquence Postgres ` +
          `désynchronisée après un insert SQL manuel — réaligner avec setval (cf. ` +
          `docs/testing/environnement-local.md, section Reset).`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new RegistrationConflictError({ cause: err });
    }
  }
}
