import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { VerifyEmailService } from './verify-email.service';
import { EmailVerificationDto } from './dto/email-verification.dto';

@Controller('email')
export class VerifyEmailController {
  constructor(private readonly verifyEmailService: VerifyEmailService) {}

  @Post('send-verification')
  async sendVerification(@Body() emailVerificationDto: EmailVerificationDto) {
    await this.verifyEmailService.sendVerificationEmail(emailVerificationDto);
    return { message: 'Email de confirmation envoyé' };
  }

  @Get('verify')
  async verify(@Query('token') token: string) {
    const email = await this.verifyEmailService.confirmEmail(token);
    return { message: `Email ${email} verifié avec succés ` };
  }
}
