import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import registrationOtpConfig from 'src/iam/infrastructure/config/registration-otp.config';
import { RegistrationOtpHandlers } from './commands/registration-otp.handlers';
import { SendOtpOnUserRegistered } from './events/user-registered.handler';

/**
 * Le code à 6 chiffres de l'inscription : envoi initial (sur événement),
 * renvoi et vérification. Séparé d'OtpModule (le second facteur) parce que
 * les deux flux ne partagent aucun état — seulement un motif.
 */
@Module({
  // Les handlers injectent registrationOtpConfig.KEY : forFeature doit être
  // déclaré ici, il ne se propage pas depuis IamInfrastructureModule.
  imports: [CqrsModule, ConfigModule.forFeature(registrationOtpConfig)],
  providers: [...RegistrationOtpHandlers, SendOtpOnUserRegistered],
})
export class RegistrationOtpModule {}
