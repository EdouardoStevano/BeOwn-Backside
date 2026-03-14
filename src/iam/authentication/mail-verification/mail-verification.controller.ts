import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Auth } from '../decorators/auth.decorator';
import { AuthType } from '../enums/auth-type.enum';
import { MailVerificationService } from './mail-verification.service';
import { MailVerificationDto } from '../dto/email-verification.dto';

@Auth(AuthType.None)
@Controller('auth/mail')
export class MailVerificationController {
  constructor(
    private readonly mailVerificationService: MailVerificationService,
  ) {}

  @Post('send-verification')
  async sendVerification(@Body() mailVerificationDto: MailVerificationDto) {
    await this.mailVerificationService.sendVerificationEmail(
      mailVerificationDto,
    );
    return { message: 'Email de confirmation envoyé' };
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    const email = await this.mailVerificationService.confirmMail(token);
    return { message: `Email ${email} verifié avec succès ` };
  }
}
