import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { NodemailerMailService } from 'src/common/email/nodemailer.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { JwtAuthGuard } from 'src/iam/authentication/infrastructures/guards/jwt-auth.guard';
import { InitiateEmailTfaUseCase } from './application/usecases/initiate-email-tfa.usecase';
import { ConfirmEmailTfaUseCase } from './application/usecases/confirm-email-tfa.usecase';
import { DisableEmailTfaUseCase } from './application/usecases/disable-email-tfa.usecase';
import { VerifyEmailOtpUseCase } from './application/usecases/verify-email-otp.usecase';
import { TfaController } from './presentation/http/tfa.controller';

@Module({
  imports: [IamInfrastructureModule, UsersInfrastructureModule],
  providers: [
    InitiateEmailTfaUseCase,
    ConfirmEmailTfaUseCase,
    DisableEmailTfaUseCase,
    VerifyEmailOtpUseCase,
    { provide: EMAIL_SERVICE, useClass: NodemailerMailService },
    JwtAuthGuard,
  ],
  controllers: [TfaController],
})
export class TfaModule {}
