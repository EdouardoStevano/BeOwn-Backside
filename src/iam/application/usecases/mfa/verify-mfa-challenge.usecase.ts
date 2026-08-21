import { Injectable } from '@nestjs/common';
import {
  InvalidOtpCodeError,
  MfaChallengeNotFoundError,
  MfaChallengePurposeMismatchError,
} from 'src/iam/domain/errors';
import {
  MfaChallengePurpose,
  type MfaChallenge,
} from 'src/iam/application/dto/mfa-challenge';
import { MFAChallengeCacheService } from '../../services/mfa/mfa-challenge-cache.service';
import { MfaFactorService } from '../../services/mfa/mfa-factor.service';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface VerifyMfaChallengeCommand {
  challengeId: string;
  code: string;
}

/**
 * Éprouve un code MFA contre le challenge qui l'attend — **et rien de plus**.
 *
 * Aucune session n'est ouverte ici, aucun token n'est délivré, aucun facteur
 * n'est retiré : ce use case répond à la seule question « ce code est-il le
 * bon ? ». Agir sur la preuve appartient à ses appelants —
 * `CompleteMfaSignInUseCase` (`POST /auth/sign-in/mfa`) pour la connexion,
 * `DisableMfaUseCase` pour le retrait d'un facteur.
 *
 * Il n'est **pas** exposé en HTTP. Une route de vérification pure a existé, et
 * a été retirée : elle offrait une seconde façon de tester un code sans rien
 * apporter, doublait la consommation du quota de requêtes, et sur TOTP
 * déclarait valide un code qui aurait expiré avant l'appel suivant.
 */
@Injectable()
export class VerifyMfaChallengeUseCase {
  constructor(
    private readonly mfaChallenges: MFAChallengeCacheService,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  /**
   * Retrouve le challenge, contrôle éventuellement son `purpose`, éprouve le
   * code et décompte l'essai s'il est faux. Rend le challenge à l'appelant,
   * **sans le consommer** — à celui qui agit dessus de le retirer une fois son
   * effet appliqué.
   *
   * Mutualisé pour que la connexion et le retrait de facteur reposent sur
   * exactement la même vérification : deux façons de vérifier un code
   * finiraient par diverger.
   */
  async prove(
    command: VerifyMfaChallengeCommand,
    expectedPurpose?: MfaChallengePurpose,
  ): Promise<MfaChallenge> {
    const challenge = await this.mfaChallenges.find(command.challengeId);
    if (!challenge) throw new MfaChallengeNotFoundError();

    if (expectedPurpose && challenge.purpose !== expectedPurpose) {
      throw new MfaChallengePurposeMismatchError();
    }

    const strategy = this.mfaFactors.strategyFor(challenge.method);
    if (!(await strategy.verify(challenge.userId, command.code))) {
      await this.mfaChallenges.registerFailedAttempt(challenge.id);
      throw new InvalidOtpCodeError();
    }

    return challenge;
  }
}
