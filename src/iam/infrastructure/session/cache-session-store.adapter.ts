import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  SessionRefresh,
  SessionStore,
} from 'src/iam/application/ports/session-store.port';

/** Une clé par session, et non par compte : c'est ce qui rend le multi-appareil possible. */
const cle = (utilisateurId: number, refreshTokenId: string): string =>
  `session:${utilisateurId}:${refreshTokenId}`;

/**
 * Support **volatil** des sessions — le chemin rapide.
 *
 * Ce qu'il stocke n'a aucune valeur en soi : la présence de la clé *est*
 * l'information. La valeur `1` n'est là que parce qu'un cache ne sait pas
 * stocker un ensemble vide.
 *
 * Volatil au sens fort : un `FLUSHALL` ou une éviction sous pression mémoire
 * en efface le contenu sans prévenir. C'est précisément ce que le proxy
 * rattrape en descendant vers la table.
 */
@Injectable()
export class CacheSessionStore implements SessionStore {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async enregistrer(session: SessionRefresh): Promise<void> {
    const ttl = session.expireLe.getTime() - Date.now();
    // Une session déjà échue n'a pas à occuper le cache — et un TTL négatif
    // serait interprété comme « sans expiration » par certains drivers.
    if (ttl <= 0) return;

    await this.cache.set<number>(
      cle(session.utilisateurId, session.refreshTokenId),
      1,
      ttl,
    );
  }

  async estValide(
    utilisateurId: number,
    refreshTokenId: string,
  ): Promise<boolean> {
    const presente = await this.cache.get<number>(
      cle(utilisateurId, refreshTokenId),
    );
    return presente !== undefined && presente !== null;
  }

  async revoquer(utilisateurId: number, refreshTokenId: string): Promise<void> {
    await this.cache.del(cle(utilisateurId, refreshTokenId));
  }

  /**
   * Un cache ne sait pas énumérer ses clés — ou seulement au prix d'un `SCAN`
   * qui balaie toute l'instance. Le proxy fournit donc les identifiants qu'il
   * a lus dans la table, et cette méthode reste inatteignable en pratique :
   * elle n'existe que pour honorer le port.
   */
  revoquerToutes(): Promise<void> {
    return Promise.resolve();
  }

  /** Retire des clés connues — utilisé par le proxy, qui les tient de la table. */
  async revoquerPlusieurs(
    utilisateurId: number,
    refreshTokenIds: readonly string[],
  ): Promise<void> {
    await Promise.all(
      refreshTokenIds.map((id) => this.cache.del(cle(utilisateurId, id))),
    );
  }
}
