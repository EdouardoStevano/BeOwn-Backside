import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER_SERVICE } from '../domain/ports/cahe-manager.service';
import { TOKEN_SERVICE } from '../domain/ports/token.service';
import { RedisCacheService } from './redis-cache.service';
import { JwtTokenService } from './jwt-token.service';
import { OTP_SERVICE } from '../domain/ports/otp.service';
import {OtpImplService} from './otp-impl.service';

@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: CACHE_MANAGER_SERVICE, useClass: RedisCacheService },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_SERVICE, useClass: OtpImplService },
  ],
  exports: [CACHE_MANAGER_SERVICE, TOKEN_SERVICE, OTP_SERVICE],
})
export class IamInfrastructureModule {}
