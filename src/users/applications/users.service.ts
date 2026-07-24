import { Injectable } from '@nestjs/common';
import { RegisterDto } from '../presenters/dto/user.dto';
import { RegisterUseCase } from './usecases/register.usecase';

@Injectable()
export class UsersService {
  constructor(private readonly registerUsecase: RegisterUseCase) {}
  create(registerDto: RegisterDto) {
    return this.registerUsecase.execute(registerDto);
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
