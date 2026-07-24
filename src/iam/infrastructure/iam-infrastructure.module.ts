import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER_SERVICE } from '../domains/ports/cahe-manager.service';
import { TOKEN_SERVICE } from '../domains/ports/token.service';
import { RedisCacheService } from './redis-cache.service';
import { JwtTokenService } from './jwt-token.service';

@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: CACHE_MANAGER_SERVICE, useClass: RedisCacheService },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
  ],
  exports: [CACHE_MANAGER_SERVICE, TOKEN_SERVICE],
})
export class IamInfrastructureModule {}
