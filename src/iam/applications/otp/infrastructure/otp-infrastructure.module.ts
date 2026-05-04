import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { OTP_SERVICE } from '../applications/ports/otp.service';
import { RedisImplService } from './otp-impl.service';

@Module({
  imports: [IamInfrastructureModule],
  providers: [{ provide: OTP_SERVICE, useClass: RedisImplService }],
  exports: [OTP_SERVICE],
})
export class OtpInfrastructureModule {}
