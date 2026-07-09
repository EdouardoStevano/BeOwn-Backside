import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { ProfilesInfrastructureModule } from 'src/profiles/infrastructure/profiles-infrastructure.module';
import { HASHING_SERVICE } from 'src/common/hashing/hashing.service';
import { BcryptService } from 'src/common/hashing/bcrypt.service';
import { SMS_SERVICE } from 'src/common/sms/sms.service';
import { NoopSmsService } from 'src/common/sms/noop-sms.service';
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
 */
@Module({
  imports: [
    IamInfrastructureModule,
    UsersInfrastructureModule,
    ProfilesInfrastructureModule,
  ],
  providers: [
    { provide: HASHING_SERVICE, useClass: BcryptService },
    // Placeholder SMS sender for the signup flow — V2-T2 swaps this binding
    // for the live TwilioSmsService (already in the repo). Scoped to this
    // module so it does not affect the global 2FA SMS OTP wiring.
    { provide: SMS_SERVICE, useClass: NoopSmsService },
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
