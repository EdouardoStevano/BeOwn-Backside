import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructure/persistences/entities/user-email.entity';
import { TFAMethodEntity } from 'src/users/infrastructure/persistences/entities/tfa-method.entity';
import { EmailMethodEntity } from 'src/users/infrastructure/persistences/entities/email-method.entity';
import { SMSMethodEntity } from 'src/users/infrastructure/persistences/entities/sms-method.entity';
import { TOTPMethodEntity } from 'src/users/infrastructure/persistences/entities/totp-method.entity';
import { SpvEntity } from 'src/projects/infrastructure/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/profiles/infrastructure/persistences/entities/kyc.entity';
import { NotificationEntity } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { AuditLogEntity } from 'src/notifications/infrastructure/persistences/entities/audit-log.entity';
import { DocumentEntity } from 'src/documents/infrastructure/persistences/entities/document.entity';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { AvisEntity } from 'src/avis/infrastructure/persistences/entities/avis.entity';
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { UniteLouableEntity } from 'src/locative-management/infrastructure/persistences/entities/unite-louable.entity';
import { LocataireEntity } from 'src/locative-management/infrastructure/persistences/entities/locataire.entity';
import { BailEntity } from 'src/locative-management/infrastructure/persistences/entities/bail.entity';
import { LoyerEncaisseEntity } from 'src/locative-management/infrastructure/persistences/entities/loyer-encaisse.entity';
import { PeriodeDistributionEntity } from 'src/distributions/infrastructure/persistences/entities/periode-distribution.entity';
import { DistributionPartEntity } from 'src/distributions/infrastructure/persistences/entities/distribution-part.entity';
import { SeedService } from './seed.service';

const SEED_ENTITIES = [
  UserEntity,
  UserEmailEntity,
  TFAMethodEntity,
  EmailMethodEntity,
  SMSMethodEntity,
  TOTPMethodEntity,
  SpvEntity,
  ProjectEntity,
  WalletEntity,
  TransactionEntity,
  InvestmentEntity,
  EcheanceEntity,
  ReservationEntity,
  ProfilPPEntity,
  ProfilPMEntity,
  KycEntity,
  NotificationEntity,
  AuditLogEntity,
  DocumentEntity,
  OrdreMarcheEntity,
  AvisEntity,
  SignatureEntity,
  UniteLouableEntity,
  LocataireEntity,
  BailEntity,
  LoyerEncaisseEntity,
  PeriodeDistributionEntity,
  DistributionPartEntity,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'pass123',
      database: process.env.DATABASE_DB || 'postgres',
      entities: SEED_ENTITIES,
      // Datafake dev : on aligne le schéma sur les entités (crée notamment les
      // tables locatif/distribution absentes des migrations historiques).
      synchronize: true,
    }),
    TypeOrmModule.forFeature(SEED_ENTITIES),
  ],
  providers: [SeedService],
})
export class SeedModule {}
