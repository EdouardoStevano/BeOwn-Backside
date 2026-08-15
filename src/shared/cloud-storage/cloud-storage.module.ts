import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudStorageService } from './cloud-storage.service';

/**
 * Stockage de fichiers (Cloudinary). Vit dans `shared/` parce que six
 * contextes l'utilisent — documents, investissements, gestion locative, news,
 * paiements, marché secondaire — et qu'il ne connaît aucun de leur
 * vocabulaire : il ne manipule que des octets, un nom et un type MIME.
 */
@Module({
  imports: [ConfigModule],
  providers: [CloudStorageService],
  exports: [CloudStorageService],
})
export class CloudStorageModule {}
