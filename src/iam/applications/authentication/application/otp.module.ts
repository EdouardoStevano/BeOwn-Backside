import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpInfrastructureModule } from 'src/iam/applications/otp/infrastructure/otp-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructure/users-infrastructure.module';
import { CreateEmailOtpUseCase } from 'src/iam/applications/otp/applications/usecases/create-email-otp.usecase';
import { CreateTotpUseCase } from 'src/iam/applications/otp/applications/usecases/create-totp.usecase';
import { CreateSmsOtpUseCase } from 'src/iam/applications/otp/applications/usecases/create-sms-otp.usecase';
import { OtpController } from 'src/iam/presenters/otp/http/otp.controller';
import { IamModule } from 'src/iam/iam.module';
import { TOTPMethodEntity } from 'src/users/infrastructure/persistences/entities/totp-method.entity';

@Module({
  imports: [
    OtpInfrastructureModule,
    UsersInfrastructureModule,
    TypeOrmModule.forFeature([TOTPMethodEntity]),
    forwardRef(() => IamModule),
  ],
  providers: [CreateEmailOtpUseCase, CreateTotpUseCase, CreateSmsOtpUseCase],
  controllers: [OtpController],
})
export class OtpModule {}
