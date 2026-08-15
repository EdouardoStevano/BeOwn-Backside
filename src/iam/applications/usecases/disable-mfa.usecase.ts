import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidOtpCodeError,
  MfaChallengeNotFoundError,
  MfaChallengePurposeMismatchError,
  NoActiveMfaMethodError,
} from 'src/iam/domains/errors';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { MfaChallengePurpose } from 'src/iam/applications/models/mfa-challenge';
import { MFAChallengeCacheService } from '../services/mfa-challenge-cache.service';
import { MfaFactorService } from '../services/mfa-factor.service';

/** Demande de désactivation : émet le défi à relever. */
export interface RequestDisableMfaCommand {
  userId: number;
  /** Canal visé. Par défaut, le facteur actif du compte. */
  method?: MfaMethodType;
}

/** Défi à relever pour obtenir la désactivation. */
export interface DisableMfaChallenge {
  challengeId: string;
  method: MfaMethodType;
  /** Destination masquée du code, absente pour TOTP. */
  sentTo?: string;
}

/** Confirmation : le code prouve qu'on possède encore le facteur retiré. */
export interface ConfirmDisableMfaCommand {
  userId: number;
  challengeId: string;
  code: string;
}

/**
 * Retrait d'un facteur, en deux temps.
 *
 * Retirer une protection est une opération au moins aussi sensible que celle
 * qu'elle protège : une session volée suffirait sinon à désarmer le compte
 * avant d'en prendre le contrôle. On exige donc de prouver une dernière fois
 * le facteur qu'on s'apprête à retirer — c'est ce que porte le `challengeId`
 * du body.
 *
 * Les deux temps passent par la même route : `POST /auth/mfa/disable` sans
 * `challengeId` émet le défi, avec `challengeId` + `code` l'exécute.
 */
@Injectable()
export class DisableMfaUseCase {
  constructor(
    private readonly mfaChallenges: MFAChallengeCacheService,
    private readonly mfaFactors: MfaFactorService,
  ) {}

  /** Premier temps : envoie le code (email/SMS) et rend le `challengeId`. */
  async request(
    command: RequestDisableMfaCommand,
  ): Promise<DisableMfaChallenge> {
    const method =
      command.method ??
      (await this.mfaFactors.findActiveMethod(command.userId));
    if (!method) throw new NoActiveMfaMethodError();

    const strategy = this.mfaFactors.strategyFor(method);
    if (!(await strategy.isActiveFor(command.userId))) {
      // Le canal demandé explicitement n'est pas celui qui est actif : rien à
      // désactiver, et surtout aucun code à envoyer sur un canal non enrôlé.
      throw new NoActiveMfaMethodError();
    }

    const { sentTo } = await strategy.issue(command.userId);

    const challenge = await this.mfaChallenges.issue({
      userId: command.userId,
      method,
      purpose: MfaChallengePurpose.DISABLE,
      sentTo,
    });

    return { challengeId: challenge.id, method, sentTo };
  }

  /** Second temps : vérifie le code et retire le facteur. */
  async confirm(command: ConfirmDisableMfaCommand): Promise<MfaMethodType> {
    const challenge = await this.mfaChallenges.find(command.challengeId);
    if (!challenge) throw new MfaChallengeNotFoundError();

    // Deux contrôles distincts, volontairement : le `purpose` empêche qu'un
    // challenge de connexion serve à désarmer le compte, et le `userId`
    // qu'un challenge légitimement obtenu sur un compte agisse sur un autre.
    if (challenge.purpose !== MfaChallengePurpose.DISABLE) {
      throw new MfaChallengePurposeMismatchError();
    }
    if (challenge.userId !== command.userId) {
      throw new MfaChallengePurposeMismatchError();
    }

    const strategy = this.mfaFactors.strategyFor(challenge.method);
    if (!(await strategy.verify(challenge.userId, command.code))) {
      await this.mfaChallenges.registerFailedAttempt(challenge.id);
      throw new InvalidOtpCodeError();
    }

    await this.mfaChallenges.discard(challenge.id);
    await strategy.deactivate(challenge.userId);

    return challenge.method;
  }
}
