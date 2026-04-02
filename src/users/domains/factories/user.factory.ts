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
}

@Injectable()
export class UserFactory {
  constructor(
    @Inject(HASHING_SERVICE) private readonly hashingService: HashingService,
  ) {}
  async create(props: CreateUserProps): Promise<User> {
    const user = new User();

    user.firstname = props.firstname;
    user.lastname = props.lastname;
    user.password = await this.hashingService.hash(props.password!);
    user.userEmail = new UserEmail(props.email);
    user.tfaMethods = [];
    user.socialId = null;
    return user;
  }
}
