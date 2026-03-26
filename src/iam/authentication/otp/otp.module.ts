import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { ConfigModule } from '@nestjs/config';
import otpConfig from './config/otp.config';

@Module({
  imports: [ConfigModule.forFeature(otpConfig)],
  providers: [OtpService],
  controllers: [OtpController],
  exports: [OtpService],
})
export class OtpModule {}
