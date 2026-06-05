import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { UserEmailEntity } from 'src/users/infrastructure/persistences/entities/user-email.entity';
import { TFAMethodEntity } from 'src/users/infrastructure/persistences/entities/tfa-method.entity';
import { EmailMethodEntity } from 'src/users/infrastructure/persistences/entities/email-method.entity';
import { SMSMethodEntity } from 'src/users/infrastructure/persistences/entities/sms-method.entity';
import { TOTPMethodEntity } from 'src/users/infrastructure/persistences/entities/totp-method.entity';
import { SpvEntity } from 'src/projects/infrastructures/persistences/entities/spv.entity';
import { ProjectEntity } from 'src/projects/infrastructures/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructures/persistences/entities/wallet.entity';
import { SeedService } from './seed.service';

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
      entities: [
        UserEntity,
        UserEmailEntity,
        TFAMethodEntity,
        EmailMethodEntity,
        SMSMethodEntity,
        TOTPMethodEntity,
        SpvEntity,
        ProjectEntity,
        WalletEntity,
      ],
      synchronize: false,
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      UserEmailEntity,
      TFAMethodEntity,
      EmailMethodEntity,
      SMSMethodEntity,
      TOTPMethodEntity,
      SpvEntity,
      ProjectEntity,
      WalletEntity,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
