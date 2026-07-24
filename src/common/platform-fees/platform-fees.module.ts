import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { PlatformFeesService } from './platform-fees.service';
import { PublicFeesController } from './public-fees.controller';

/**
 * Module global exposant PlatformFeesService partout (distributions,
 * projects, marché secondaire…) sans ré-import explicite.
 *
 * Expose aussi un endpoint public (GET /public/platform-fees) consommé
 * par le Frontside pour afficher des taux toujours à jour.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingsEntity])],
  controllers: [PublicFeesController],
  providers: [PlatformFeesService],
  exports: [PlatformFeesService],
})
export class PlatformFeesModule {}
