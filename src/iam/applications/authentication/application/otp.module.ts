import { Module } from '@nestjs/common';
import { OtpInfrastructureModule } from 'src/iam/applications/otp/infrastructure/otp-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { CreateEmailOtpUseCase } from 'src/iam/applications/otp/applications/usecases/create-email-otp.usecase';
import { CreateTotpUseCase } from 'src/iam/applications/otp/applications/usecases/create-totp.usecase';
import { OtpController } from 'src/iam/presenters/otp/http/otp.controller';

@Module({
  imports: [OtpInfrastructureModule, UsersInfrastructureModule],
  providers: [CreateEmailOtpUseCase, CreateTotpUseCase],
  controllers: [OtpController],
})
export class OtpModule {}
