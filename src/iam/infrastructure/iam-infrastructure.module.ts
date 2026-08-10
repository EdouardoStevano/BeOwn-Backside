import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER_SERVICE } from '../domains/ports/cache-manager.port';
import { TOKEN_SERVICE } from '../domains/ports/token.port';
import { RedisCacheAdapter } from './cache/redis-cache.adapter';
import { JwtTokenAdapter } from './token/jwt-token.adapter';

/**
 * Noyau d'infrastructure IAM partagé par tous les autres Bounded Contexts
 * (émission/vérification de tokens et cache de sessions). Volontairement
 * limité à ces deux ports : les adapters propres à une feature IAM (OTP,
 * TOTP, notifications, OAuth) sont câblés dans le module de leur feature,
 * pour ne pas imposer ces dépendances aux ~20 modules qui n'ont besoin que
 * de `TOKEN_SERVICE` (CRP, §5).
 */
@Module({
  imports: [
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: CACHE_MANAGER_SERVICE, useClass: RedisCacheAdapter },
    { provide: TOKEN_SERVICE, useClass: JwtTokenAdapter },
  ],
  exports: [CACHE_MANAGER_SERVICE, TOKEN_SERVICE],
})
export class IamInfrastructureModule {}
