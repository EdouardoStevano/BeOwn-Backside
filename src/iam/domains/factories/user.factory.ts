import { Inject, Injectable } from '@nestjs/common';
import { User } from 'src/iam/domains/models/user';
import { Password } from 'src/iam/domains/value-objects/password.vo';
import {
  HASHING_SERVICE,
  type HashingService,
} from 'src/common/hashing/hashing.service';

export interface CreateUserProps {
  firstname: string;
  lastname: string | null;
  email: string;
  password: string | null;
  socialId: string | null;
  emailVerified?: boolean;
  /** Acceptation des CGU — relayée telle quelle à `User.register` (qui pose l'horodatage serveur). */
  cguAcceptation?: { version: string; ip: string | null };
}

@Injectable()
export class UserFactory {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}
  async create(props: CreateUserProps): Promise<User> {
    // Le hachage reste ici : c'est la seule responsabilité de cette factory que
    // le domaine ne peut pas assumer (il ignore bcrypt). `User.register` reçoit
    // une empreinte, jamais un mot de passe en clair.
    //
    // Le mot de passe est éprouvé avant d'être haché : une fois l'empreinte
    // calculée, plus personne ne peut dire si la politique était respectée. Un
    // compte social (`password: null`) n'en a pas et n'est donc pas concerné.
    const passwordHash = props.password
      ? await this.hashingService.hash(Password.of(props.password).value)
      : null;

    return User.register({
      firstname: props.firstname,
      lastname: props.lastname,
      email: props.email,
      passwordHash,
      socialId: props.socialId,
      emailVerified: props.emailVerified,
      cguAcceptation: props.cguAcceptation,
    });
  }
}
