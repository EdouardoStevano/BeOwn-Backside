import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_SERVICE } from './email.service';
import { NodemailerMailService } from './nodemailer.service';
import { EmailTemplateEntity } from './entities/email-template.entity';
import { EmailTemplateService } from './email-template.service';

/**
 * Module email global, qui porte deux choses :
 *
 * - le binding unique du port EMAIL_SERVICE (le transport). Un module qui a
 *   besoin d'un autre adapter (NotificationTestModule et son BrevoEmailService)
 *   peut toujours le redéclarer localement : un provider local prime sur un
 *   provider global ;
 * - EmailTemplateService (les templates en base), injectable partout sans
 *   ré-import explicite — même pattern que PlatformFeesModule/SmsModule.
 *
 * Le seed des templates par défaut se fait au bootstrap
 * (EmailTemplateService.onModuleInit → seedDefaults, idempotent).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateEntity])],
  providers: [
    { provide: EMAIL_SERVICE, useClass: NodemailerMailService },
    EmailTemplateService,
  ],
  exports: [EMAIL_SERVICE, EmailTemplateService],
})
export class EmailModule {}
