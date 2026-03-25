import { Injectable } from '@nestjs/common';
import { User } from '../user';
import { UserEmail } from '../value-objects/user-email.vo';
import { randomUUID } from 'crypto';

export interface CreateUserProps {
  firstname: string;
  lastname: string | null;
  email: string;
  password: string | null;
}

@Injectable()
export class UserFactory {
  async create(props: CreateUserProps): Promise<User> {
    const user = new User();

    user.firstname = props.firstname;
    user.lastname = props.lastname;
    user.password = props.password;
    user.userEmail = new UserEmail(props.email);
    user.tfaMethods = [];
    user.socialId = null;
    return user;
  }
}
