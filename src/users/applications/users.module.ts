import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersInfrastructureModule } from '../infrastructures/users-infrastructure.module';
import { UserController } from '../presenters/http/user.controller';
import { RegisterUseCase } from './usecases/register.usecase';
import { UserFactory } from '../domains/factories/user.factory';

@Module({
  imports: [UsersInfrastructureModule],
  providers: [UsersService, RegisterUseCase, UserFactory],
  controllers: [UserController],
})
export class UsersModule {}
