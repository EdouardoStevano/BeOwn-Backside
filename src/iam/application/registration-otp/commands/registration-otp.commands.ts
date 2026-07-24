import { Command } from '@nestjs/cqrs';
import { AuthTokens } from 'src/iam/domain/ports/token.service';

/** Le canal de livraison du code d'inscription. */
export type RegistrationOtpChannel = 'email' | 'sms';

/**
 * Premier envoi, déclenché par l'inscription elle-même. Distinct du renvoi :
 * ici il n'y a ni anti-rejeu à consulter, ni contrat anti-énumération à tenir —
 * l'appelant vient de créer le compte.
 */
export class SendRegistrationOtpCommand extends Command<void> {
  constructor(
    public readonly accountId: number,
    public readonly email: string,
    public readonly channel: RegistrationOtpChannel = 'email',
  ) {
    super();
  }
}

/** Renvoi explicite, à la demande de l'utilisateur. */
export class ResendRegistrationOtpCommand extends Command<void> {
  constructor(
    public readonly email: string,
    public readonly channel: RegistrationOtpChannel = 'email',
  ) {
    super();
  }
}

/**
 * Vérification du code : active le compte et ouvre la session dans la foulée,
 * pour que l'utilisateur n'ait pas à ressaisir ses identifiants juste après
 * avoir prouvé qu'il détient l'adresse.
 */
export class VerifyRegistrationOtpCommand extends Command<AuthTokens> {
  constructor(
    public readonly email: string,
    public readonly code: string,
  ) {
    super();
  }
}
