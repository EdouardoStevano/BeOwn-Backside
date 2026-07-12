import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import appUrlsConfig from 'src/iam/infrastructure/config/app-urls.config';
import { EmailVerificationController } from 'src/iam/presenters/http/email-verification.controller';
import { SendVerificationLinkHandler } from './commands/send-verification-link.handler';
import { ConfirmEmailHandler } from './commands/confirm-email.handler';

@Module({
  // Le handler et le contrôleur injectent appUrlsConfig.KEY : forFeature doit
  // être déclaré ici, il ne se propage pas depuis IamInfrastructureModule.
  imports: [CqrsModule, ConfigModule.forFeature(appUrlsConfig)],
  providers: [SendVerificationLinkHandler, ConfirmEmailHandler],
  controllers: [EmailVerificationController],
})
export class EmailVerificationModule {}
