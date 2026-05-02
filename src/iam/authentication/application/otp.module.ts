import { Module } from '@nestjs/common';
import { OtpInfrastructureModule } from 'src/iam/otp/infrastructure/otp-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';
import { CreateEmailOtpUseCase } from 'src/iam/otp/applications/usecases/create-email-otp.usecase';
import { CreateTotpUseCase } from 'src/iam/otp/applications/usecases/create-totp.usecase';
import { OtpController } from 'src/iam/otp/presenters/http/otp.controller';

@Module({
  imports: [OtpInfrastructureModule, UsersInfrastructureModule],
  providers: [CreateEmailOtpUseCase, CreateTotpUseCase],
  controllers: [OtpController],
})
export class OtpModule {}
