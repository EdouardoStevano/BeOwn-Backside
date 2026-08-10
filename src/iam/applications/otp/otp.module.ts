import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { TFAMethodEntity } from 'src/iam/infrastructure/persistence/entities/tfa-method.entity';
import { TOTPMethodEntity } from 'src/iam/infrastructure/persistence/entities/totp-method.entity';
import { EmailMethodEntity } from 'src/iam/infrastructure/persistence/entities/email-method.entity';
import { SMSMethodEntity } from 'src/iam/infrastructure/persistence/entities/sms-method.entity';
import { OTP_STORE } from 'src/iam/domains/ports/otp-store.port';
import { TOTP_GENERATOR } from 'src/iam/domains/ports/totp-generator.port';
import { TOTP_METHOD_REPOSITORY } from 'src/iam/domains/ports/totp-method.repository';
import { SECRET_CIPHER } from 'src/iam/domains/ports/secret-cipher.port';
import { AUTH_MAILER } from 'src/iam/domains/ports/auth-mailer.port';
import { RedisOtpStoreAdapter } from 'src/iam/infrastructure/otp/redis-otp-store.adapter';
import { OtplibTotpGeneratorAdapter } from 'src/iam/infrastructure/otp/otplib-totp-generator.adapter';
import { TypeOrmTotpMethodRepository } from 'src/iam/infrastructure/persistence/repositories/typeorm-totp-method.repository';
import { AesGcmSecretCipherAdapter } from 'src/iam/infrastructure/crypto/aes-gcm-secret-cipher.adapter';
import { NestAuthMailerAdapter } from 'src/iam/infrastructure/mailer/nest-auth-mailer.adapter';
import { CreateEmailOtpUseCase } from './usecases/create-email-otp.usecase';
import { CreateTotpUseCase } from './usecases/create-totp.usecase';
import { CreateSmsOtpUseCase } from './usecases/create-sms-otp.usecase';
import { OtpController } from 'src/iam/presenters/http/otp.controller';

/**
 * OTP 2FA/connexion (email, SMS, TOTP).
 *
 * N'importe plus `IamModule` : ce `forwardRef` mutuel n'existait que pour
 * atteindre l'ancien binding local de `SMS_SERVICE`, désormais fourni par le
 * `SmsModule` global. Une dépendance circulaire entre modules est un symptôme
 * de découpage, pas une fatalité à contourner (§5).
 */
@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    ConfigModule,
    // Toute la hiérarchie STI des méthodes 2FA est déclarée ici, et non dans
    // IamInfrastructureModule : ce dernier reste limité aux tokens et au cache
    // dont dépendent les ~23 modules à contrôleur authentifié (CRP, §5). La
    // classe parente `TFAMethodEntity` doit figurer dans les métadonnées pour
    // que les `@ChildEntity` se résolvent ; elle l'était via
    // UsersInfrastructureModule avant le déplacement.
    TypeOrmModule.forFeature([
      TFAMethodEntity,
      TOTPMethodEntity,
      EmailMethodEntity,
      SMSMethodEntity,
    ]),
  ],
  providers: [
    { provide: OTP_STORE, useClass: RedisOtpStoreAdapter },
    { provide: TOTP_GENERATOR, useClass: OtplibTotpGeneratorAdapter },
    { provide: TOTP_METHOD_REPOSITORY, useClass: TypeOrmTotpMethodRepository },
    { provide: SECRET_CIPHER, useClass: AesGcmSecretCipherAdapter },
    { provide: AUTH_MAILER, useClass: NestAuthMailerAdapter },
    CreateEmailOtpUseCase,
    CreateTotpUseCase,
    CreateSmsOtpUseCase,
  ],
  controllers: [OtpController],
})
export class OtpModule {}
