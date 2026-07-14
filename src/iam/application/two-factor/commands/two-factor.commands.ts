import { Command } from '@nestjs/cqrs';
import { TwoFactorMethod } from 'src/iam/domain/ports/two-factor.gateway';

/** Ce que le client doit afficher pour que l'utilisateur confirme le canal. */
export interface TwoFactorEnrollmentStarted {
  method: TwoFactorMethod;
  /** Où le code a été envoyé (adresse ou numéro). Absent pour TOTP. */
  sentTo?: string;
  /** TOTP seulement : à afficher en QR code. */
  uri?: string;
  /** TOTP seulement : la saisie manuelle, pour qui ne peut pas scanner. */
  secret?: string;
}

export interface TwoFactorEnabled {
  twoFactorMethod: TwoFactorMethod;
}

/**
 * Première étape : on enregistre le canal *sans* l'activer, et on envoie un
 * code dessus. Tant que ConfirmTwoFactorCommand n'est pas passée, le sign-in
 * ignore ce canal — un utilisateur qui abandonne en cours de route reste
 * capable de se connecter.
 */
export class EnrollTwoFactorCommand extends Command<TwoFactorEnrollmentStarted> {
  constructor(
    public readonly accountId: number,
    public readonly email: string,
    public readonly method: TwoFactorMethod,
    /** Requis pour SMS, ignoré sinon. */
    public readonly phone?: string,
  ) {
    super();
  }
}

/** Seconde étape : le code reçu prouve que le canal fonctionne, on l'active. */
export class ConfirmTwoFactorCommand extends Command<TwoFactorEnabled> {
  constructor(
    public readonly accountId: number,
    public readonly email: string,
    public readonly method: TwoFactorMethod,
    public readonly otp: string,
  ) {
    super();
  }
}

export class DisableTwoFactorCommand extends Command<void> {
  constructor(
    public readonly accountId: number,
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
