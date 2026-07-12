import { Global, Module } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.service';
import { NodemailerMailService } from './nodemailer.service';

/**
 * Binding unique du port EMAIL_SERVICE. Un module qui a besoin d'un autre
 * adapter (NotificationTestModule et son BrevoEmailService) peut toujours le
 * redéclarer localement : un provider local prime sur un provider global.
 */
@Global()
@Module({
  providers: [{ provide: EMAIL_SERVICE, useClass: NodemailerMailService }],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
