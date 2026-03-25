import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { UserFactory } from 'src/users/domains/factories/user.factory';
import { USER_REPOSITORY } from '../ports/repositories/user.repository';
import { RegisterDto } from 'src/users/presenters/dto/user.dto';
import { User } from 'src/users/domains/user';
import { UserTypeOrmRepository } from 'src/users/infrastructures/persistences/repositories/user.repository';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly userFactory: UserFactory,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserTypeOrmRepository,
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
    });

    return this.userRepository.save(user);
  }
}
