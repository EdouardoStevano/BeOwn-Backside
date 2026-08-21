import { Global, Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Fournit le stockage Redis partagé de la limitation de débit (M-5).
 * `@Global` : `ThrottlerModule.forRootAsync` l'injecte depuis app.module.
 */
@Global()
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
