import { Module } from '@nestjs/common';
import { IamInfrastructureModule } from 'src/iam/infrastructure/iam-infrastructure.module';
import { UsersInfrastructureModule } from 'src/iam/infrastructure/users-infrastructure.module';
import { AUTH_MAILER } from 'src/iam/domains/ports/auth-mailer.port';
import { NestAuthMailerAdapter } from 'src/iam/infrastructure/mailer/nest-auth-mailer.adapter';
import { SendEmailVerificationUseCase } from './usecases/send-email-verification.usecase';
import { ConfirmEmailUseCase } from './usecases/confirm-email.usecase';
import { EmailVerificationController } from 'src/iam/presenters/http/email-verification.controller';

/** Parcours legacy de confirmation d'adresse par lien (`/email/*`). */
@Module({
  imports: [IamInfrastructureModule, UsersInfrastructureModule],
  providers: [
    { provide: AUTH_MAILER, useClass: NestAuthMailerAdapter },
    SendEmailVerificationUseCase,
    ConfirmEmailUseCase,
  ],
  controllers: [EmailVerificationController],
  // Exporté pour que le sign-up (AuthenticationModule) émette le lien de
  // vérification via ce même use case, plutôt qu'avec sa propre copie.
  exports: [SendEmailVerificationUseCase],
})
export class EmailVerificationModule {}
