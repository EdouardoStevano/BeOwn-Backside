import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import { NodemailerMailService } from 'src/common/email/nodemailer.service';
import { SendVerificationUseCase } from './application/usecases/send-verification.usecase';
import { ConfirmEmailUseCase } from './application/usecases/confirm-email.usecase';
import { EmailVerificationController } from './presentation/http/email-verification.controller';

@Module({
  imports: [IamInfrastructureModule, UsersInfrastructureModule],
  providers: [
    SendVerificationUseCase,
    ConfirmEmailUseCase,
    { provide: EMAIL_SERVICE, useClass: NodemailerMailService },
  ],
  controllers: [EmailVerificationController],
})
export class EmailVerificationModule {}
