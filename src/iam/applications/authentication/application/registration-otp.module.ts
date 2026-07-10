import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { RegistrationOtpService } from './usecases/registration-otp.service';
import { SendRegistrationOtpUseCase } from './usecases/send-registration-otp.usecase';
import { VerifyRegistrationOtpUseCase } from './usecases/verify-registration-otp.usecase';
import { ResendRegistrationOtpUseCase } from './usecases/resend-registration-otp.usecase';

/**
 * Self-contained feature module for the signup OTP flow (V2-T1), imported by
 * both UsersModule (RegisterUseCase triggers the initial send) and
 * AuthenticationModule (verify-otp/resend-otp endpoints) — kept separate
 * from OtpModule (2FA/login OTP) since the two share no state, only the
 * "hashed code in Redis" pattern.
 *
 * SMS_SERVICE is NOT bound here (V2-T2): the global SmsModule (imported once
 * in AppModule) is the single source of truth, selecting TwilioSmsService or
 * NoopSmsService for the whole app based on Twilio env vars.
 */
@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    ProfilesInfrastructureModule,
  ],
  providers: [
    { provide: HASHING_SERVICE, useClass: BcryptService },
    RegistrationOtpService,
    SendRegistrationOtpUseCase,
    VerifyRegistrationOtpUseCase,
    ResendRegistrationOtpUseCase,
  ],
  exports: [
    RegistrationOtpService,
    SendRegistrationOtpUseCase,
    VerifyRegistrationOtpUseCase,
    ResendRegistrationOtpUseCase,
  ],
})
export class RegistrationOtpModule {}
