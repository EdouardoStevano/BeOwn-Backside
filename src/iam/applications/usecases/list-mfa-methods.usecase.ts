import { Inject, Injectable } from '@nestjs/common';
import {
  MFA_CHALLENGE_STRATEGIES,
  type MfaChallengeStrategy,
  type MfaMethodSummary,
} from '../strategies/mfa-challenge.strategy';

/**
 * Facteurs enrôlés par un compte, tous canaux confondus.
 *
 * Interroge chaque canal plutôt que le repository directement : le masquage de
 * la destination est propre au canal (`j***n@example.com`, `+33******78`), et
 * TOTP n'en a pas. Passer par les stratégies garde donc ce use case ignorant
 * des canaux — en ajouter un ne le modifie pas (§4 Open/Closed, §9 Strategy).
 *
 * Aucune erreur quand le compte n'a aucun facteur : une liste vide est une
 * réponse valide, pas une anomalie. C'est justement ce que l'écran de sécurité
 * a besoin de savoir pour proposer un enrôlement.
 */
@Injectable()
export class ListMfaMethodsUseCase {
  constructor(
    @Inject(MFA_CHALLENGE_STRATEGIES)
    private readonly strategies: readonly MfaChallengeStrategy[],
  ) {}

  async execute(userId: number): Promise<MfaMethodSummary[]> {
    // En parallèle : les canaux sont indépendants et chacun coûte une requête.
    const perChannel = await Promise.all(
      this.strategies.map((strategy) => strategy.describeFor(userId)),
    );

    return perChannel.flat();
  }
}
