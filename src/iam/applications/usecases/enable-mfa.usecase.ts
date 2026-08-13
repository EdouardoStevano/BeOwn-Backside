import { Inject, Injectable } from '@nestjs/common';
import { NoPendingMfaEnrollmentError } from 'src/iam/domains/errors';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import {
  TFA_ENROLLMENT_STRATEGIES,
  type TfaEnrollmentStrategy,
} from '../strategies/tfa-enrollment.strategy';

/** Entrée du use case — le canal n'y figure pas, il est déduit (§1). */
export interface EnableMfaCommand {
  userId: number;
  code: string;
}

/**
 * Active le facteur dont l'enrôlement est en attente.
 *
 * `POST /auth/mfa/enable` ne porte qu'un code, sans canal : le redemander
 * serait redondant — l'appelant vient d'appeler `/auth/mfa/enroll`, c'est le
 * serveur qui sait ce qui est en cours. Chaque stratégie garantissant au plus
 * un enrôlement en attente par canal (`deletePendingForUser`), la déduction ne
 * peut pas être ambiguë.
 *
 * Reste le cas où deux canaux ont chacun un enrôlement en attente, si
 * l'utilisateur a démarré l'un puis l'autre sans confirmer. Le code tranche
 * alors de lui-même : on tente les canaux en attente et le bon code n'en
 * valide qu'un — celui qui l'a émis.
 */
@Injectable()
export class EnableMfaUseCase {
  private readonly strategies: readonly TfaEnrollmentStrategy[];

  constructor(
    @Inject(TFA_ENROLLMENT_STRATEGIES)
    strategies: readonly TfaEnrollmentStrategy[],
  ) {
    this.strategies = strategies;
  }

  /** Renvoie le canal activé, pour que l'appelant sache ce qu'il a confirmé. */
  async execute(command: EnableMfaCommand): Promise<TfaMethodType> {
    const { userId, code } = command;

    const pending: TfaEnrollmentStrategy[] = [];
    for (const strategy of this.strategies) {
      if (await strategy.hasPending(userId)) pending.push(strategy);
    }

    if (pending.length === 0) throw new NoPendingMfaEnrollmentError();

    let lastError: unknown;
    for (const strategy of pending) {
      try {
        await strategy.confirm({ method: strategy.method, userId, otp: code });
        return strategy.method;
      } catch (err) {
        // Un code faux sur un canal ne dit rien des autres : on garde l'erreur
        // et on continue. Elle n'est relevée que si aucun canal ne reconnaît
        // le code, de sorte que l'appelant reçoive « code invalide » plutôt
        // qu'un succès silencieux.
        lastError = err;
      }
    }

    throw lastError;
  }
}
