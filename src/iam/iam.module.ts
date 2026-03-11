import { Module } from '@nestjs/common';
import { HashingService } from './hashing/hashing.service';
import { BcryptService } from './hashing/bcrypt.service';
import { AuthenticationController } from './authentication/authentication.controller';
import { AuthenticationService } from './authentication/authentication.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { TokenService } from './token/token.service';
import { RefreshTokenIdsStorage } from './authentication/refresh-token-ids.storage/refresh-token-ids.storage';
import { GoogleAuthController } from './authentication/social/controllers/google-auth.controller';
import { FacebookAuthController } from './authentication/social/controllers/facebook-auth.controller';
import { LinkedinAuthController } from './authentication/social/controllers/linkedin-auth.controller';
import { GoogleStrategy } from './authentication/social/strategies/google.strategy';
import { FacebookStrategy } from './authentication/social/strategies/facebook.strategy';
import { LinkedinStrategy } from './authentication/social/strategies/linkedin.strategy';
import { SocialAuthService } from './authentication/social/social-authentication.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: HashingService, useClass: BcryptService },
    AuthenticationService,
    TokenService,
    RefreshTokenIdsStorage,
    GoogleStrategy,
    FacebookStrategy,
    LinkedinStrategy,
    SocialAuthService,
  ],
  controllers: [
    AuthenticationController,
    GoogleAuthController,
    FacebookAuthController,
    LinkedinAuthController,
  ],
})
export class IamModule {}
