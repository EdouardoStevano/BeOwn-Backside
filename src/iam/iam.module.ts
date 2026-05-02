import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication/application/authentication.module';
import { EmailVerificationModule } from './email-verification/email-verification.module';

@Module({
  imports: [AuthenticationModule, EmailVerificationModule],
})
export class IamModule {}
