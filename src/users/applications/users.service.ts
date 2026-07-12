import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterDto } from '../presenters/dto/user.dto';
import { User } from '../domains/user';
import { RegisterCommand } from './commands/register.command';

@Injectable()
export class UsersService {
  constructor(private readonly commandBus: CommandBus) {}

  create(registerDto: RegisterDto): Promise<User> {
    return this.commandBus.execute(
      new RegisterCommand(
        registerDto.firstname,
        registerDto.lastname ?? null,
        registerDto.email,
        registerDto.password,
      ),
    );
  }

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  // update(id: number, updateUserDto: UpdateUserDto) {
  //   return `This action updates a #${id} user`;
  // }
  //
  // remove(id: number) {
  //   return `This action removes a #${id} user`;
  // }
}
