import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sentOtpEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Votre code de vérification',
      text: otp,
      context: {
        otp,
        expiresIn: '5 minutes',
        year: new Date().getFullYear(),
      },
    });
  }
}
