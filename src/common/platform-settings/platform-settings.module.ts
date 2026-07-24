import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsEntity } from 'src/admin/entities/admin-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Global : PlatformSettingsService injectable partout (même pattern que
 * EmailModule). Importé une fois dans AppModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminSettingsEntity])],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
