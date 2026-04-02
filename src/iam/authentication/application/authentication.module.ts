import { Module } from '@nestjs/common';
import { SignInUsecase } from './usecases/sign-in.usecase';
import { AuthenticationController } from '../presenters/http/authentication.controller';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';

@Module({
  imports: [IamInfrastructureModule, UsersInfrastructureModule],
  providers: [
    SignInUsecase,
    { provide: HASHING_SERVICE, useClass: BcryptService },
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
