import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './application/authentication/authentication.module';
import { OtpModule } from './application/otp/otp.module';
import { TwoFactorModule } from './application/two-factor/two-factor.module';
import { EmailVerificationModule } from './application/email-verification/email-verification.module';

/**
 * Racine du contexte IAM : les adapters d'un côté, les familles de use cases de
 * l'autre (authentification, OTP, second facteur, vérification d'email).
 *
 * Plus de forwardRef : le cycle avec OtpModule n'existait que pour propager
 * SMS_SERVICE, désormais fourni globalement par SmsModule.
 */
@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    OtpModule,
    TwoFactorModule,
    EmailVerificationModule,
  ],
})
export class IamModule {}
