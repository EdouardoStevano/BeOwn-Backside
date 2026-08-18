import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './config/jwt.config';
import { TokenSignerModule } from 'src/shared/token/token-signer.module';
import { SessionCacheService } from '../applications/services/session-cache.service';
import { TokenService } from '../applications/services/token/token.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SESSION_STORE } from '../applications/ports/session-store.port';
import { RefreshTokenEntity } from './persistence/entities/refresh-token.entity';
import { TypeOrmSessionStore } from './persistence/repositories/typeorm-session-store.repository';
import { CacheSessionStore } from './session/cache-session-store.adapter';
import { CacheFirstSessionStoreProxy } from './session/cache-first-session-store.proxy';

/**
 * Noyau d'infrastructure IAM partagé par tous les autres Bounded Contexts
 * (émission/vérification de tokens et cache de sessions). Volontairement
 * limité à ces deux services : les adapters propres à une feature IAM (OTP,
 * TOTP, notifications, OAuth) sont câblés dans le module de leur feature,
 * pour ne pas imposer ces dépendances aux ~20 modules qui n'ont besoin que
 * de `TokenService` (CRP, §5).
 *
 * Le driver de signature vient de `TokenSignerModule` (shared) : c'est lui
 * qui décide comment un token est signé. Ce module-ci ne câble plus que la
 * politique IAM posée par-dessus.
 */
@Module({
  imports: [
    TokenSignerModule,
    ConfigModule.forFeature(jwtConfig),
    // La table des sessions : `TokenService` en dépend par `SESSION_STORE`, et
    // c'est elle qui les fait survivre à un redémarrage du cache.
    TypeOrmModule.forFeature([RefreshTokenEntity]),
  ],
  providers: [
    // Classes concrètes, injectées par leur type : ce sont des services
    // **applicatifs**, pas des ports. `TOKEN_SERVICE` a disparu avec
    // `JwtTokenAdapter` — le seul point d'extension restant est `TOKEN_SIGNER`,
    // dans `shared/`. Seul le cache de **sessions** est câblé ici, parce que
    // `TokenService` — fourni par ce module et consommé par une vingtaine
    // d'autres — en dépend. Les caches de tokens email et d'OTP restent dans
    // `AuthenticationModule`, seul à s'en servir (CRP, §5).
    SessionCacheService,
    TokenService,
    // Les deux supports de session, et le proxy qui les compose (§9). Seul le
    // proxy est publié sous le port : personne d'autre n'a à savoir qu'il y a
    // un cache devant une table.
    CacheSessionStore,
    TypeOrmSessionStore,
    { provide: SESSION_STORE, useClass: CacheFirstSessionStoreProxy },
    CacheFirstSessionStoreProxy,
  ],
  exports: [SessionCacheService, TokenService, SESSION_STORE],
})
export class IamInfrastructureModule {}
