import { Module } from '@nestjs/common';
import { OtpInfrastructureModule } from 'src/iam/otp/infrastructure/otp-infrastructure.module';
import { UsersInfrastructureModule } from 'src/users/infrastructures/users-infrastructure.module';

@Module({ imports: [OtpInfrastructureModule, UsersInfrastructureModule] })
export class OtpModule {}
