import { Module } from '@nestjs/common';
import jwtConfig from '../config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CacheService } from '../domain/ports/cache.service';
import { RedisService } from './redis.service';

@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [{ provide: CacheService, useClass: RedisService }],
})
export class IamInfrastructureModule {}
