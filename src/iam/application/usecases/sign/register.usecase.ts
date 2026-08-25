import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { EmailAlreadyRegisteredError } from 'src/iam/domain/errors';
import { UserFactory } from '../../../domain/factories/user.factory';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { User } from 'src/iam/domain/aggregates/user';
import { UserRegisteredDomainEvent } from 'src/iam/domain/events/user-registered.domain-event';

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
 * **S'inscrire deux fois avec la même adresse non vérifiée reprend le premier
 * compte au lieu d'en créer un second.** Qui laissait expirer son lien de
 * vérification se retrouvait dehors : l'adresse était « déjà prise » par un
 * compte dont personne n'avait prouvé la possession, et aucun parcours ne
 * permettait de la récupérer. La reprise garde l'identifiant du compte — donc
 * tout ce qui s'y rattacherait — et n'ouvre rien à personne : tant que
 * l'adresse n'est pas vérifiée, `SignInUseCase` refuse la connexion, et le
 * seul chemin qui mène quelque part reste le lien envoyé à cette adresse.
 *
 * La garde s'en trouve resserrée, pas relâchée : elle refusait sur
 * `isEmailVerified()`, si bien qu'un compte non vérifié mais **suspendu ou
 * clos** passait au travers et partait créer un doublon. C'est désormais
 * `inscriptionInachevee()` qui tranche — vérifiée ou sanctionnée, l'adresse
 * est refusée.
 *
 * Ce use case ne fait que ça : obtenir le compte, puis lever
 * `UserRegisteredDomainEvent`. Tout ce qui suit une inscription sans la
 * conditionner appartient aux abonnés (§8) — l'envoi du lien de vérification
 * comme la notification des administrateurs, tous deux dans
 * `UserRegisteredEventHandler`. S'inscrire réussit ou échoue sur la seule
 * question de savoir si le compte a pu être créé.
 */
@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(registerDto: RegisterInput): Promise<User> {
    const existing = await this.userRepository.findByEmail(registerDto.email);
    if (existing && !existing.inscriptionInachevee()) {
      throw new EmailAlreadyRegisteredError();
    }

    // Une inscription restée en chemin se reprend sur le même compte : c'est
    // son identifiant qui est réutilisé, pas un second compte qui naît.
    const user = existing
      ? await this.userFactory.reprendre(existing, {
          firstname: registerDto.firstname,
          lastname: registerDto.lastname ?? null,
          password: registerDto.password,
        })
      : await this.userFactory.create({
          firstname: registerDto.firstname,
          lastname: registerDto.lastname ?? null,
          email: registerDto.email,
          password: registerDto.password,
          socialId: null,
        });

    const savedUser = await this.userRepository.save(user);

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
}
