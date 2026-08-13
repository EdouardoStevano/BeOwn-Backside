import { Inject, Injectable } from '@nestjs/common';
import { TfaMethodType } from 'src/iam/domains/enums/tfa-method.enum';
import { UnsupportedTfaMethodError } from 'src/iam/domains/errors';
import {
  TFA_CHALLENGE_STRATEGIES,
  type TfaChallengeStrategy,
} from '../strategies/tfa-challenge.strategy';

/**
 * Ordre dans lequel un facteur est retenu quand le compte en a plusieurs.
 *
 * TOTP d'abord : il ne coûte ni SMS ni email, ne dépend d'aucun réseau de
 * livraison et ne peut pas être intercepté en transit. Le SMS passe avant
 * l'email parce qu'il suppose la possession d'un appareil, là où une boîte
 * email est justement ce que protège le mot de passe qu'on vient de saisir.
 */
const PREFERENCE: readonly TfaMethodType[] = [
  TfaMethodType.TOTP,
  TfaMethodType.SMS,
  TfaMethodType.EMAIL,
];

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
  private readonly byMethod: ReadonlyMap<TfaMethodType, TfaChallengeStrategy>;

  constructor(
    @Inject(TFA_CHALLENGE_STRATEGIES)
    strategies: readonly TfaChallengeStrategy[],
  ) {
    this.byMethod = new Map(
      strategies.map((strategy) => [strategy.method, strategy]),
    );
  }

  /** Stratégie du canal, ou `UnsupportedTfaMethodError` s'il est inconnu. */
  strategyFor(method: TfaMethodType): TfaChallengeStrategy {
    const strategy = this.byMethod.get(method);
    if (!strategy) throw new UnsupportedTfaMethodError(method);
    return strategy;
  }

  /**
   * Facteur à opposer au compte, `null` s'il n'en a aucun d'actif — auquel cas
   * l'appelant poursuit sans MFA.
   */
  async findActiveMethod(userId: number): Promise<TfaMethodType | null> {
    for (const method of PREFERENCE) {
      const strategy = this.byMethod.get(method);
      if (strategy && (await strategy.isActiveFor(userId))) return method;
    }

    return null;
  }
}
