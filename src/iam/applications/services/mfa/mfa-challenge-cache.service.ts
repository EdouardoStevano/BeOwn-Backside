import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { randomUUID } from 'crypto';
import {
  MFA_CHALLENGE_MAX_ATTEMPTS,
  MfaChallenge,
  MfaChallengeDraft,
} from 'src/iam/applications/models/mfa-challenge';

/**
 * Durée de vie d'un challenge. Assez long pour recevoir un SMS et le saisir,
 * assez court pour qu'une connexion à moitié faite ne reste pas ouverte : une
 * fenêtre de cinq minutes pendant laquelle le mot de passe est déjà validé.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const key = (challengeId: string): string => `mfa-challenge-${challengeId}`;

/**
 * Forme réellement stockée. `expiresAt` n'appartient pas au modèle de domaine
 * — c'est une nécessité d'implémentation : réécrire l'entrée après un essai
 * manqué repartirait sinon pour un TTL plein, et enchaîner les erreurs
 * prolongerait la fenêtre aussi longtemps qu'on veut.
 */
interface StoredChallenge extends MfaChallenge {
  expiresAt: number;
}

/**
 * Garde les challenges MFA en attente de preuve : quel compte, quel canal,
 * pour quoi faire, combien d'essais restants.
 *
 * Aux côtés des autres caches de la feature (`SessionCacheService`,
 * `TokenEmailCacheService`) et branché comme eux directement sur
 * `CACHE_MANAGER` : le backend se choisit dans `CacheModule.register()`
 * (`app.module.ts`), pas ici. Le port `MfaChallengeStore` qui l'abstrayait a
 * disparu avec le déplacement — son unique implémentation vivant désormais
 * dans la même couche, l'indirection ne protégeait plus de rien.
 *
 * Ce qu'il porte et qui ne se délègue pas : la durée de vie du challenge, le
 * décompte des essais, et le refus des entrées périmées.
 */
@Injectable()
export class MFAChallengeCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** Émet un challenge et rend son identifiant, seule part qui circule. */
  async issue(draft: MfaChallengeDraft): Promise<MfaChallenge> {
    // Identifiant opaque : il ne dérive ni du compte ni du canal, sans quoi le
    // simple fait de le détenir renseignerait sur le compte visé.
    const stored: StoredChallenge = {
      ...draft,
      id: randomUUID(),
      attemptsLeft: MFA_CHALLENGE_MAX_ATTEMPTS,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    };

    await this.cache.set(key(stored.id), stored, CHALLENGE_TTL_MS);

    return this.toDomain(stored);
  }

  /**
   * Lit le challenge sans le consommer. Rend `null` s'il est inconnu, expiré
   * ou épuisé — l'appelant n'a pas à distinguer ces cas, qui se répondent tous
   * « recommencez ».
   */
  async find(challengeId: string): Promise<MfaChallenge | null> {
    const stored = await this.read(challengeId);
    return stored ? this.toDomain(stored) : null;
  }

  /**
   * Décompte un essai manqué et détruit le challenge quand il n'en reste plus.
   * Sans ce décompte, la fenêtre de validité vaudrait un nombre illimité de
   * tentatives sur un code à six chiffres.
   */
  async registerFailedAttempt(challengeId: string): Promise<void> {
    const stored = await this.read(challengeId);
    if (!stored) return;

    const attemptsLeft = stored.attemptsLeft - 1;
    if (attemptsLeft <= 0) {
      await this.discard(challengeId);
      return;
    }

    // Réécriture sur le temps qu'il restait, jamais sur un TTL neuf.
    await this.cache.set(
      key(challengeId),
      { ...stored, attemptsLeft },
      stored.expiresAt - Date.now(),
    );
  }

  /** Retire définitivement le challenge : preuve apportée, ou abandon. */
  async discard(challengeId: string): Promise<void> {
    await this.cache.del(key(challengeId));
  }

  /**
   * Lecture brute, avec contrôle d'échéance explicite : le TTL Redis suffit en
   * principe, mais un backend de cache mémoire configuré autrement rendrait
   * une entrée périmée. La date fait foi.
   */
  private async read(challengeId: string): Promise<StoredChallenge | null> {
    const stored = await this.cache.get<StoredChallenge>(key(challengeId));
    if (!stored) return null;

    if (stored.expiresAt <= Date.now()) {
      await this.discard(challengeId);
      return null;
    }

    return stored;
  }

  /** Retire l'échéance, qui est une donnée d'implémentation. */
  private toDomain(stored: StoredChallenge): MfaChallenge {
    const { id, userId, method, purpose, sentTo, attemptsLeft } = stored;
    return { id, userId, method, purpose, sentTo, attemptsLeft };
  }
}
