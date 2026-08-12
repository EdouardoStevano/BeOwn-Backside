import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { UnsupportedTfaMethodError } from 'src/iam/domains/errors';
import {
  TFA_ENROLLMENT_STRATEGIES,
  type TfaEnrollmentChallenge,
  type TfaEnrollmentConfirmation,
  type TfaEnrollmentRequest,
  type TfaEnrollmentStrategy,
} from '../../services/authentication/tfa-enrollment.strategy';

/**
 * Point d'entrée unique de l'enrôlement 2FA, quel que soit le canal.
 *
 * Le canal est une donnée de la requête (`method`) et non plus un segment
 * d'URL : ce use case se contente de résoudre la stratégie correspondante
 * (§9 — Strategy) et de lui déléguer. Il ne contient aucune logique propre à
 * TOTP, à l'email ou au SMS, donc ajouter un canal ne le modifie pas.
 */
@Injectable()
export class EnrollTfaUseCase {
  private readonly strategies: ReadonlyMap<
    TfaMethodType,
    TfaEnrollmentStrategy
  >;

  constructor(
    @Inject(TFA_ENROLLMENT_STRATEGIES)
    strategies: readonly TfaEnrollmentStrategy[],
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
  async start(request: TfaEnrollmentRequest): Promise<TfaEnrollmentChallenge> {
    return this.strategyFor(request.method).start(request);
  }

  /** Confirme la possession du facteur et active la méthode enrôlée. */
  async confirm(confirmation: TfaEnrollmentConfirmation): Promise<void> {
    return this.strategyFor(confirmation.method).confirm(confirmation);
  }

  private strategyFor(method: TfaMethodType): TfaEnrollmentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) throw new UnsupportedTfaMethodError(method);
    return strategy;
  }
}
