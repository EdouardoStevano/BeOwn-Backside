import { Module } from '@nestjs/common';
import { SignInUsecase } from './usecases/sign-in.usecase';
import { AuthenticationController } from '../presenters/http/authentication.controller';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { RefreshTokenUseCase } from './usecases/refresh-token.usecase';
import { UsersModule } from 'src/users/applications/users.module';
import { GoogleStrategy } from './strategies/google-auth.strategy';
import { FacebookAuthStrategy } from './strategies/facebook-auth.strategy';
import { LinkedinStrategy } from './strategies/linkedin-auth.strategy';
import { SocialAuthUseCase } from './usecases/social-auth.usecase';

@Module({
  imports: [IamInfrastructureModule, UsersInfrastructureModule, UsersModule],
  providers: [
    SignInUsecase,
    RefreshTokenUseCase,
    { provide: HASHING_SERVICE, useClass: BcryptService },
    GoogleStrategy,
    FacebookAuthStrategy,
    LinkedinStrategy,
    SocialAuthUseCase,
  ],
  controllers: [AuthenticationController],
})
export class AuthenticationModule {}
