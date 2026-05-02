import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication/application/authentication.module';
import { EmailVerificationModule } from './email-verification/email-verification.module';
import { TfaModule } from './tfa/tfa.module';

@Module({
  imports: [AuthenticationModule, EmailVerificationModule, TfaModule],
})
export class IamModule {}
