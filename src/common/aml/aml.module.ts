import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlMonitorService } from './aml-monitor.service';
import { AdminComplianceController } from './admin-compliance.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { PersonneGeleeEntity } from './entities/personne-gelee.entity';
import { GelDesAvoirsPort } from './gel-des-avoirs.port';
import { GelDesAvoirsService } from './gel-des-avoirs.service';
import { SanctionsScreeningPort } from './sanctions-screening.port';
import { SanctionsScreeningService } from './sanctions-screening.service';

@Module({
  imports: [
    NotificationsModule,
    IamInfrastructureModule,
    // Le cumul LCB-FT du mois glissant est reconstitué depuis le grand livre :
    // en LECTURE SEULE — ce module ne doit jamais écrire un mouvement.
    // ProfilPPEntity : lecture seule aussi, pour l'identité vérifiée
    // (nom/prénom/date de naissance) comparée à la liste de gel.
    TypeOrmModule.forFeature([
      UserEntity,
      WalletEntity,
      TransactionEntity,
      ProfilPPEntity,
      PersonneGeleeEntity,
    ]),
  ],
  controllers: [AdminComplianceController],
  providers: [
    AmlMonitorService,
    GelDesAvoirsService,
    SanctionsScreeningService,
    // Ports (abstract class = contrat + token) : les consommateurs externes
    // — usecases d'argent sortant, machine à états KYC — dépendent d'eux,
    // jamais des services concrets.
    { provide: GelDesAvoirsPort, useExisting: GelDesAvoirsService },
    { provide: SanctionsScreeningPort, useExisting: SanctionsScreeningService },
  ],
  exports: [AmlMonitorService, GelDesAvoirsPort, SanctionsScreeningPort],
})
export class AmlModule {}
