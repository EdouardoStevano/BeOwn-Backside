import { Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import {
  MfaChallengeNotFoundError,
  MfaChallengeNotResendableError,
  MfaChallengePurposeMismatchError,
} from 'src/iam/domains/errors';
import { MfaChallengePurpose } from 'src/iam/applications/models/mfa-challenge';
import { MFAChallengeCacheService } from '../services/mfa/mfa-challenge-cache.service';
import { MfaFactorService } from '../services/mfa/mfa-factor.service';

/** Entrée du use case — indépendante du DTO HTTP (§1). */
export interface ResendMfaChallengeCommand {
  challengeId: string;
  /**
   * Finalité attendue. Exigée, jamais déduite : chaque route sait pour quel
   * parcours elle renvoie, et un défi ne doit pas changer de camp au passage.
   */
  purpose: MfaChallengePurpose;
  /**
   * Compte de la session, sur les parcours authentifiés. Fourni, il interdit
   * qu'un défi légitimement obtenu sur un compte serve depuis un autre — même
   * contrôle que `DisableMfaUseCase.confirm`. Absent sur la connexion, où il
   * n'y a précisément pas encore de session.
   */
  userId?: number;
}

/** Où le nouveau code est parti — le défi, lui, n'a pas bougé. */
export interface MfaChallengeResent {
  challengeId: string;
  method: MfaMethodType;
  /** Destination masquée du code. */
  sentTo?: string;
}

/**
 * Réexpédie le code d'un défi en cours — « je n'ai pas reçu le SMS ».
 *
 * Sert les deux parcours qui envoient un code : la connexion
 * (`POST /auth/sign-in/mfa/resend`, publique) et le retrait d'un facteur
 * (`POST /auth/mfa/disable/resend`, authentifiée). Chacune annonce sa finalité,
 * qui est vérifiée ici.
 *
 * **Le défi n'est pas remplacé** : même `challengeId`, mêmes essais restants,
 * même échéance. Seul le code change, l'ancien étant écrasé dans le magasin
 * d'OTP. C'est ce qui rend l'opération sûre sans compteur supplémentaire : le
 * plafond de trois essais vit sur le défi, qu'on ne touche pas, si bien que
 * renvoyer un code n'en accorde aucun de plus.
 *
 * C'est précisément ce que ne fait **pas** un simple rappel de la route
 * d'émission : `DisableMfaUseCase.request` frappe un défi neuf à chaque appel,
 * laisse le précédent vivre son TTL, et rend donc trois essais de plus à chaque
 * fois — sur le même code à six chiffres. Ce use case existe pour offrir un
 * renvoi qui n'a pas cet effet.
 *
 * Le nombre d'**envois**, lui, se borne au niveau HTTP : c'est un souci de coût
 * et de nuisance (SMS non sollicités), pas de sécurité du facteur.
 */
@Injectable()
export class ResendMfaChallengeUseCase {
  constructor(
    private readonly mfaChallenges: MFAChallengeCacheService,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  async execute(
    command: ResendMfaChallengeCommand,
  ): Promise<MfaChallengeResent> {
    const challenge = await this.mfaChallenges.find(command.challengeId);
    if (!challenge) throw new MfaChallengeNotFoundError();

    // Deux contrôles distincts, comme dans `DisableMfaUseCase.confirm` : le
    // `purpose` empêche qu'un défi de connexion serve à désarmer un compte, le
    // `userId` qu'un défi obtenu sur un compte agisse sur un autre.
    if (challenge.purpose !== command.purpose) {
      throw new MfaChallengePurposeMismatchError();
    }
    if (command.userId !== undefined && challenge.userId !== command.userId) {
      throw new MfaChallengePurposeMismatchError();
    }

    if (challenge.method === MfaMethodType.TOTP) {
      throw new MfaChallengeNotResendableError();
    }

    // `issue()` écrase le code précédent sur la même clé — pas de garde
    // « code déjà actif » sur ce chemin, précisément pour que réexpédier reste
    // possible tant que le défi vit.
    const { sentTo } = await this.mfaFactors
      .strategyFor(challenge.method)
      .issue(challenge.userId);

    return { challengeId: challenge.id, method: challenge.method, sentTo };
  }
}
