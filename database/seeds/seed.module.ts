import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserEmailEntity } from 'src/iam/infrastructure/persistence/entities/user-email.entity';
import { MfaMethodEntity } from 'src/iam/infrastructure/persistence/entities/mfa-method.entity';
import { SpvEntity } from 'src/projects/infrastructure/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ReservationEntity } from 'src/reservations/infrastructure/persistences/entities/reservation.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProfilPMEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pm.entity';
import { KycEntity } from 'src/kyc/infrastructure/persistences/entities/kyc.entity';
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
  MfaMethodEntity,
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
      // Glob de TOUTES les entités (même source de vérité que src/data-source.ts) :
      // le synchronize dev crée l'intégralité du schéma, y compris les entités
      // récentes (email_templates, user_preferences, charge…) absentes des
      // migrations historiques. Évite la dérive d'une liste figée à maintenir.
      entities: ['src/**/*.entity.ts'],
      synchronize: true,
    }),
    TypeOrmModule.forFeature(SEED_ENTITIES),
  ],
  providers: [SeedService],
})
export class SeedModule {}
