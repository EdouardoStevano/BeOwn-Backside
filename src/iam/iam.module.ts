import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from './infrastructure/iam-infrastructure.module';
import { AuthenticationModule } from './authentication/application/authentication.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { VerifyEmailService } from './verify-email/verify-email.service';
import { VerifyEmailController } from './verify-email/verify-email.controller';

@Module({
  imports: [
    IamInfrastructureModule,
    AuthenticationModule,
    UsersInfrastructureModule,
  ],
  providers: [VerifyEmailService],
  controllers: [VerifyEmailController],
})
export class IamModule {}
