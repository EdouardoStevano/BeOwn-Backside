import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersInfrastructureModule } from '../infrastructures/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { RegisterUseCase } from './usecases/register.usecase';
import { UserFactory } from '../domains/factories/user.factory';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';

@Module({
  imports: [UsersInfrastructureModule],
  providers: [
    UsersService,
    RegisterUseCase,
    UserFactory,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [UserController],
})
export class UsersModule {}
