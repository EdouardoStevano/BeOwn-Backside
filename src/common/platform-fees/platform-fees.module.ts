import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { PlatformFeesService } from './platform-fees.service';

/**
 * Module global exposant PlatformFeesService partout (distributions,
 * projects, marché secondaire…) sans ré-import explicite.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingsEntity])],
  providers: [PlatformFeesService],
  exports: [PlatformFeesService],
})
export class PlatformFeesModule {}
