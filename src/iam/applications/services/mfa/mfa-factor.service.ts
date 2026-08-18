import { Inject, Injectable } from '@nestjs/common';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { UnsupportedMfaMethodError } from 'src/iam/domains/errors';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  MFA_CHALLENGE_STRATEGIES,
  type MfaChallengeStrategy,
} from '../../strategies/mfa/mfa-challenge.strategy';

/**
 * Accès aux canaux de vérification, mutualisé par les use cases MFA.
 *
 * Les trois parcours (connexion, désactivation, et demain tout contrôle
 * sensible) ont besoin des deux mêmes services — « donne-moi la stratégie de
 * ce canal » et « quel facteur ce compte a-t-il ? ». Sans ce service, chacun
 * reconstruirait la même `Map` et redéfinirait son propre ordre de préférence,
 * qui finirait par diverger.
 */
@Injectable()
export class MfaFactorService {
  private readonly byMethod: ReadonlyMap<MfaMethodType, MfaChallengeStrategy>;

  constructor(
    @Inject(MFA_CHALLENGE_STRATEGIES)
    strategies: readonly MfaChallengeStrategy[],
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {
    this.byMethod = new Map(
      strategies.map((strategy) => [strategy.method, strategy]),
    );
  }

  /** Stratégie du canal, ou `UnsupportedMfaMethodError` s'il est inconnu. */
  strategyFor(method: MfaMethodType): MfaChallengeStrategy {
    const strategy = this.byMethod.get(method);
    if (!strategy) throw new UnsupportedMfaMethodError(method);
    return strategy;
  }

  /**
   * Facteur à opposer au compte, `null` s'il n'en a aucun d'actif — auquel cas
   * l'appelant poursuit sans MFA.
   *
   * Une lecture, là où il en fallait une par canal : le compte porte ses
   * facteurs, et **l'ordre de préférence est sa règle** (voir
   * `User.facteurActif`). Interroger les stratégies l'une après l'autre
   * demandait trois requêtes pour répondre à une question que l'agrégat sait
   * trancher seul — et laissait cet ordre au bord, hors du domaine.
   */
  async findActiveMethod(userId: number): Promise<MfaMethodType | null> {
    const compte = await this.userRepository.findByIdWithFacteurs(userId);
    return compte?.facteurActif()?.method ?? null;
  }
}
