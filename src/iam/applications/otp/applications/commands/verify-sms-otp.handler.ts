import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OTP_SERVICE, type OtpService } from '../ports/otp.service';
import { VerifySmsOtpCommand } from './verify-sms-otp.command';
import { normalizePhone, smsOtpKey } from './otp-keys';

@CommandHandler(VerifySmsOtpCommand)
export class VerifySmsOtpHandler
  implements ICommandHandler<VerifySmsOtpCommand>
{
  constructor(@Inject(OTP_SERVICE) private readonly otpService: OtpService) {}

  async execute(command: VerifySmsOtpCommand): Promise<boolean> {
    const key = smsOtpKey(normalizePhone(command.phone));
    return this.otpService.verifyOtp(key, command.otp);
  }
}
