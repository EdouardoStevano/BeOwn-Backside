import { Inject, Injectable } from '@nestjs/common';
import { User } from 'src/iam/domains/models/user';
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

@Injectable()
export class UserFactory {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}
  async create(props: CreateUserProps): Promise<User> {
    // Le hachage reste ici : c'est la seule responsabilité de cette factory que
    // le domaine ne peut pas assumer (il ignore bcrypt). `User.register` reçoit
    // une empreinte, jamais un mot de passe en clair.
    const passwordHash = props.password
      ? await this.hashingService.hash(props.password)
      : null;

    return User.register({
      firstname: props.firstname,
      lastname: props.lastname,
      email: props.email,
      passwordHash,
      socialId: props.socialId,
      emailVerified: props.emailVerified,
    });
  }
}
