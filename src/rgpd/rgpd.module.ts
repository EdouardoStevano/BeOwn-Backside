import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { CloudStorageModule } from 'src/shared/cloud-storage/cloud-storage.module';
import { CloudStorageService } from 'src/shared/cloud-storage/cloud-storage.service';
import { StockageFichiersPort } from 'src/rgpd/applications/ports/stockage-fichiers.port';
import { AnonymizeAccountService } from 'src/rgpd/applications/anonymize-account.service';
import { RgpdPurgeService } from 'src/rgpd/applications/rgpd-purge.service';
import { RgpdPurgeCronService } from 'src/rgpd/applications/rgpd-purge-cron.service';
import { AdminRgpdController } from 'src/rgpd/presenters/http/admin-rgpd.controller';

/**
 * Bounded context RGPD (lot 2, mission 3) : anonymisation à la suppression de
 * compte et purge par finalité selon le barème de conservation
 * (`domains/retention-policy.ts`, transcription du document de conformité).
 *
 * Dépendances : entités des autres contextes en LECTURE/ÉCRITURE via le
 * DataSource (traitement transverse par nature — même statut que l'export
 * art. 15/20 de la mission 2), stockage distant derrière le port
 * `StockageFichiersPort` (implémenté par le CloudStorageService partagé).
 * Aucun module métier n'est importé : pas de cycle possible — c'est
 * `UsersModule` qui importe RgpdModule pour brancher l'anonymisation sur la
 * suppression de compte.
 */
@Module({
  imports: [
    // UserEntity : contrôle défense-en-profondeur du contrôleur admin.
    TypeOrmModule.forFeature([UserEntity]),
    // Fournit `TokenService` au JwtAuthGuard que AdminRgpdController monte via
    // @UseGuards (même besoin que les autres contrôleurs authentifiés).
    IamInfrastructureModule,
    CloudStorageModule,
  ],
  providers: [
    { provide: StockageFichiersPort, useExisting: CloudStorageService },
    AnonymizeAccountService,
    RgpdPurgeService,
    RgpdPurgeCronService,
  ],
  controllers: [AdminRgpdController],
  exports: [AnonymizeAccountService],
})
export class RgpdModule {}
