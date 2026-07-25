import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateEntity } from './entities/email-template.entity';
import { EmailTemplateService } from './email-template.service';

/**
 * Module global des templates d'emails : EmailTemplateService est injectable
 * partout (transports Brevo/Nodemailer fournis localement par d'autres
 * modules via EMAIL_SERVICE, future API admin V2-T2, BroadcastService…) sans
 * ré-import explicite — même pattern que PlatformFeesModule/SmsModule.
 *
 * Le seed des templates par défaut se fait au bootstrap
 * (EmailTemplateService.onModuleInit → seedDefaults, idempotent).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateEntity])],
  providers: [EmailTemplateService],
  exports: [EmailTemplateService],
})
export class EmailModule {}
