import { Inject, Injectable } from '@nestjs/common';
import {
  AccountClosedError,
  AccountSuspendedError,
  InvalidOtpCodeError,
  MfaChallengeNotFoundError,
  MfaChallengePurposeMismatchError,
  UserNotFoundError,
} from 'src/iam/domains/errors';
import { MfaChallengePurpose } from 'src/iam/applications/models/mfa-challenge';
import { MFAChallengeCacheService } from '../services/mfa-challenge-cache.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { type AuthSession } from 'src/iam/applications/models/auth-token';
import { MfaFactorService } from '../services/mfa-factor.service';
import { SignInUsecase } from './sign-in.usecase';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface VerifyMfaChallengeCommand {
  challengeId: string;
  code: string;
}

/**
 * Second temps de la connexion : éprouve le facteur et ouvre la session.
 *
 * Le challenge porte tout le contexte (compte, canal), si bien que cet endpoint
 * n'a besoin d'aucune authentification préalable — c'est justement la
 * connexion qui n'est pas encore faite. Sa sécurité tient au fait que le
 * challenge n'est émis qu'après un mot de passe valide, qu'il expire, et qu'il
 * ne tolère qu'un nombre borné d'essais.
 */
@Injectable()
export class VerifyMfaChallengeUseCase {
  constructor(
    private readonly mfaChallenges: MFAChallengeCacheService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly mfaFactors: MfaFactorService,
    private readonly signInUsecase: SignInUsecase,
  ) {}

  async execute(command: VerifyMfaChallengeCommand): Promise<AuthSession> {
    const challenge = await this.mfaChallenges.find(command.challengeId);
    if (!challenge) throw new MfaChallengeNotFoundError();

    // Un challenge émis pour retirer un facteur ne doit pas ouvrir de session :
    // il est obtenu depuis une session déjà établie, donc à moindre coût.
    if (challenge.purpose !== MfaChallengePurpose.SIGN_IN) {
      throw new MfaChallengePurposeMismatchError();
    }

    const strategy = this.mfaFactors.strategyFor(challenge.method);
    if (!(await strategy.verify(challenge.userId, command.code))) {
      await this.mfaChallenges.registerFailedAttempt(challenge.id);
      throw new InvalidOtpCodeError();
    }

    // Consommé avant l'émission des tokens : deux requêtes concurrentes
    // porteuses du même code ne doivent pas ouvrir deux sessions.
    await this.mfaChallenges.discard(challenge.id);

    // Le compte est relu maintenant, et non figé à l'émission du challenge :
    // une sanction prononcée entre les deux étapes doit s'appliquer, sinon la
    // fenêtre de cinq minutes serait un délai de grâce pour obtenir un JWT
    // valide malgré la suspension.
    const user = await this.userRepository.findById(challenge.userId);
    if (!user) throw new UserNotFoundError();

    if (user.isSuspended()) throw new AccountSuspendedError();
    if (user.isClosed()) throw new AccountClosedError();

    return this.signInUsecase.openSession(user);
  }
}
