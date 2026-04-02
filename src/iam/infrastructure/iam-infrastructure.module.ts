import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER_SERVICE } from '../domain/ports/cahe-manager.service';
import { TOKEN_SERVICE } from '../domain/ports/token.service';
import { RedisCacheService } from './redis-cache.service';
import { USER_REPOSITORY } from 'src/users/applications/ports/repositories/user.repository';
import { UserTypeOrmRepository } from 'src/users/infrastructures/persistences/repositories/user.repository';

@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: CACHE_MANAGER_SERVICE, useClass: RedisCacheService },
    { provide: USER_REPOSITORY, useClass: UserTypeOrmRepository },
  ],
  exports: [CACHE_MANAGER_SERVICE, TOKEN_SERVICE],
})
export class IamInfrastructureModule {}
