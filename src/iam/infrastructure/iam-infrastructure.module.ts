import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { TOKEN_SERVICE } from '../applications/ports/token.port';
import { SessionCacheService } from '../applications/services/session-cache.service';
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
    // Classe concrète, injectée par son type : le port `CACHE_MANAGER_SERVICE`
    // a disparu avec `RedisCacheAdapter`. Seul le cache de **sessions** est
    // câblé ici, parce que `JwtTokenAdapter` — fourni par ce module et consommé
    // par une vingtaine d'autres — en dépend. Les caches de tokens email et
    // d'OTP restent dans `AuthenticationModule`, seul à s'en servir (CRP, §5).
    SessionCacheService,
    { provide: TOKEN_SERVICE, useClass: JwtTokenAdapter },
  ],
  exports: [SessionCacheService, TOKEN_SERVICE],
})
export class IamInfrastructureModule {}
