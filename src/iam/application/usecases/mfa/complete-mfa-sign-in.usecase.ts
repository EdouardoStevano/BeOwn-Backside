import { Inject, Injectable } from '@nestjs/common';
import {
  AccountClosedError,
  AccountSuspendedError,
  UserNotFoundError,
} from 'src/iam/domain/errors';
import { MfaChallengePurpose } from 'src/iam/application/dto/mfa-challenge';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domain/repositories/user.repository';
import { type AuthSession } from 'src/iam/application/dto/auth-token';
import { MFAChallengeCacheService } from '../../services/mfa/mfa-challenge-cache.service';
import { SignInUsecase } from '../sign/sign-in.usecase';
import { VerifyMfaChallengeUseCase } from './verify-mfa-challenge.usecase';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface CompleteMfaSignInCommand {
  challengeId: string;
  code: string;
}

/**
 * Second temps de la connexion : éprouve le facteur **et** ouvre la session.
 *
 * Distinct de `VerifyMfaChallengeUseCase`, qui se contente de dire si le code
 * est bon : ici la preuve est consommée et se paie en tokens. Le découpage
 * garde l'effet de bord — ouvrir une session — sur la seule route qui l'annonce
 * (`POST /auth/sign-in/mfa`).
 *
 * Le challenge porte tout le contexte (compte, canal), si bien que cet endpoint
 * n'a besoin d'aucune authentification préalable — c'est justement la connexion
 * qui n'est pas encore faite. Sa sécurité tient au fait que le challenge n'est
 * émis qu'après un mot de passe valide, qu'il expire, et qu'il ne tolère qu'un
 * nombre borné d'essais.
 */
@Injectable()
export class CompleteMfaSignInUseCase {
  constructor(
    private readonly verifyMfaChallenge: VerifyMfaChallengeUseCase,
    private readonly mfaChallenges: MFAChallengeCacheService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly signInUsecase: SignInUsecase,
  ) {}

  async execute(command: CompleteMfaSignInCommand): Promise<AuthSession> {
    // Un challenge émis pour retirer un facteur ne doit pas ouvrir de session :
    // il est obtenu depuis une session déjà établie, donc à moindre coût.
    const challenge = await this.verifyMfaChallenge.prove(
      command,
      MfaChallengePurpose.SIGN_IN,
    );

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

    // Le canal du challenge est, par construction, le facteur actif du compte :
    // il a été retenu à l'émission et vient d'être éprouvé. Inutile de le
    // relire pour le publier.
    return this.signInUsecase.openSession(user, challenge.method);
  }
}
