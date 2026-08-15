import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { UnsupportedMfaMethodError } from 'src/iam/domains/errors';
import {
  MFA_ENROLLMENT_STRATEGIES,
  type MfaEnrollmentChallenge,
  type MfaEnrollmentConfirmation,
  type MfaEnrollmentRequest,
  type MfaEnrollmentStrategy,
} from '../strategies/mfa-enrollment.strategy';

/**
 * Point d'entrée unique de l'enrôlement 2FA, quel que soit le canal.
 *
 * Le canal est une donnée de la requête (`method`) et non plus un segment
 * d'URL : ce use case se contente de résoudre la stratégie correspondante
 * (§9 — Strategy) et de lui déléguer. Il ne contient aucune logique propre à
 * TOTP, à l'email ou au SMS, donc ajouter un canal ne le modifie pas.
 */
@Injectable()
export class EnrollMfaUseCase {
  private readonly strategies: ReadonlyMap<
    MfaMethodType,
    MfaEnrollmentStrategy
  >;

  constructor(
    @Inject(MFA_ENROLLMENT_STRATEGIES)
    strategies: readonly MfaEnrollmentStrategy[],
  ) {
    this.strategies = new Map(
      strategies.map((strategy) => [strategy.method, strategy]),
    );
  }

  // `async` et non un simple `return` de la promesse déléguée : la résolution
  // de la stratégie peut échouer, et une méthode qui annonce `Promise` doit
  // rejeter plutôt que lever de façon synchrone — sans quoi un appelant qui
  // enchaîne un `.catch()` laisserait passer l'erreur.

  /** Démarre l'enrôlement : secret TOTP à scanner, ou code envoyé au canal. */
  async start(request: MfaEnrollmentRequest): Promise<MfaEnrollmentChallenge> {
    return this.strategyFor(request.method).start(request);
  }

  /** Confirme la possession du facteur et active la méthode enrôlée. */
  async confirm(confirmation: MfaEnrollmentConfirmation): Promise<void> {
    return this.strategyFor(confirmation.method).confirm(confirmation);
  }

  private strategyFor(method: MfaMethodType): MfaEnrollmentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) throw new UnsupportedMfaMethodError(method);
    return strategy;
  }
}
