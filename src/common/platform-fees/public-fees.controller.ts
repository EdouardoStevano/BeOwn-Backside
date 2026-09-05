import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/auth/public.decorator';
import { PlatformFeesService } from './platform-fees.service';

/** Durée de vie du cache de cette route, en millisecondes (cache-manager v7). */
export const TTL_CACHE_FRAIS_MS = 60_000;

/**
 * Endpoint public exposant les taux de frais plateforme courants.
 *
 * Consommé par le Frontside (FAQ, simulateurs) pour éviter toute
 * contradiction entre les pourcentages affichés et ceux réellement
 * appliqués (configurables par le super_admin — voir PlatformFeesService).
 */
@ApiTags('Public — Frais plateforme')
@Controller('public/platform-fees')
export class PublicFeesController {
  constructor(private readonly platformFees: PlatformFeesService) {}

  @ApiOperation({ summary: 'Taux de frais courants de la plateforme (public)' })
  /**
   * Cache 60 s, adossé au CacheModule global (Redis) : le résultat est donc
   * PARTAGÉ entre tous les réplicas et survit à un redéploiement.
   *
   * Chaque appel relisait la ligne singleton `admin_settings` en base — une
   * requête par visiteur, sur une route publique, pour une donnée identique
   * pour tout le monde et qui change quelques fois par an.
   *
   * INVALIDATION — aucune, volontairement : le cache expire seul au bout de
   * 60 s. Conséquence assumée et bornée : après une modification des taux par
   * un super_admin, la FAQ et les simulateurs peuvent afficher les anciens
   * pourcentages pendant au plus une minute. Les calculs qui ENGAGENT de
   * l'argent (distributions, frais de revente) ne passent pas par ici : ils
   * appellent `PlatformFeesService` directement, sans cache. Le jour où une
   * invalidation immédiate devient nécessaire, elle se pose à l'écriture des
   * settings admin (`CACHE_MANAGER.del('/public/platform-fees')`).
   *
   * En cas de panne Redis, `CacheInterceptor` retombe sur le handler
   * (vérifié : `catch { return next.handle() }`) — la route reste servie.
   */
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(TTL_CACHE_FRAIS_MS)
  @Public()
  @Get()
  getFees() {
    return this.platformFees.getRates();
  }
}
