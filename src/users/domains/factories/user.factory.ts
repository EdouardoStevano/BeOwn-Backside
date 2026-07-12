import { Inject, Injectable } from '@nestjs/common';
import { User } from '../user';
import { UserEmail } from '../value-objects/user-email.vo';
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
}

/**
 * Seul point de création d'un User : garantit qu'un utilisateur naît toujours
 * avec une adresse valide et un mot de passe haché (ou aucun, pour un compte
 * social). Le hachage passe par un port — la factory ignore que c'est bcrypt.
 */
@Injectable()
export class UserFactory {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}

  async create(props: CreateUserProps): Promise<User> {
    const user = new User();

    user.firstname = props.firstname;
    user.lastname = props.lastname;
    user.socialId = props.socialId;
    user.userEmail = UserEmail.create(props.email);
    user.tfaMethods = [];

    if (props.password) {
      user.changePassword(await this.hashingService.hash(props.password));
    } else {
      user.password = null;
    }

    if (props.emailVerified) {
      user.verifyEmail();
    }

    return user;
  }
}
