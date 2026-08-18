import { Injectable, Logger } from '@nestjs/common';
import {
  SessionRefresh,
  SessionStore,
} from 'src/iam/applications/ports/session-store.port';
import { TypeOrmSessionStore } from 'src/iam/infrastructure/persistence/repositories/typeorm-session-store.repository';
import { CacheSessionStore } from './cache-session-store.adapter';

/**
 * Sessions servies par le cache, garanties par la base — **Proxy** (§9).
 *
 * Le sujet réel est {@link TypeOrmSessionStore} : c'est lui qui détient la
 * vérité, et lui seul qu'on croit quand le cache se tait. Ce proxy en contrôle
 * l'accès, sans rien ajouter au contrat : il expose exactement `SessionStore`,
 * et ses appelants ignorent qu'il y a deux supports derrière.
 *
 * **Pourquoi Proxy et non Decorator.** Les deux ont la même forme — un objet
 * qui en enveloppe un autre du même type — mais pas la même intention. Un
 * décorateur *ajoute un comportement* à un objet équivalent au sien ; un proxy
 * *régit l'accès* à un sujet dont il n'est pas l'égal. C'est le cas ici : le
 * cache n'est pas un second stockage de même rang, c'est un raccourci devant
 * le vrai. La distinction se voit à {@link estValide} — le cache ne fait
 * jamais autorité pour dire « non », seule la table le peut.
 *
 * Ce que le montage rattrape : le refresh token ne vivait qu'en Redis. Un
 * `FLUSHALL`, une éviction sous pression mémoire ou un simple redémarrage du
 * conteneur déconnectait tout le monde à l'expiration des access tokens en
 * cours. Le cache peut désormais disparaître entièrement sans qu'aucune
 * session ne soit perdue — au prix d'une lecture en base, une fois, le temps
 * que la clé soit réécrite.
 */
@Injectable()
export class CacheFirstSessionStoreProxy implements SessionStore {
  private readonly logger = new Logger(CacheFirstSessionStoreProxy.name);

  constructor(
    private readonly cache: CacheSessionStore,
    private readonly durable: TypeOrmSessionStore,
  ) {}

  /**
   * **La base d'abord.** Une session que le cache seul connaîtrait
   * disparaîtrait avec lui ; l'inverse — écrite en base, absente du cache —
   * coûte une lecture de rattrapage et rien de plus.
   *
   * Un cache indisponible ne doit pas empêcher d'ouvrir une session : l'échec
   * est tracé, pas propagé.
   */
  async enregistrer(session: SessionRefresh): Promise<void> {
    await this.durable.enregistrer(session);
    await this.ecrireDansLeCache(session);
  }

  /**
   * Cache d'abord, table à défaut — et la clé est réécrite au passage, de
   * sorte qu'un cache vidé se repeuple de lui-même au fil des
   * renouvellements plutôt que de rester froid.
   *
   * L'absence dans le cache ne prouve rien : ni révocation, ni expiration,
   * seulement « je ne sais pas ». C'est pourquoi elle n'interrompt pas la
   * vérification, là où une présence, elle, suffit à conclure.
   */
  async estValide(
    utilisateurId: number,
    refreshTokenId: string,
  ): Promise<boolean> {
    if (await this.cache.estValide(utilisateurId, refreshTokenId)) return true;

    const session = await this.durable.estValide(utilisateurId, refreshTokenId);
    if (!session) return false;

    await this.rechauffer(utilisateurId, refreshTokenId);
    return true;
  }

  /** Les deux supports, la base en premier : c'est elle qui fait foi. */
  async revoquer(utilisateurId: number, refreshTokenId: string): Promise<void> {
    await this.durable.revoquer(utilisateurId, refreshTokenId);
    await this.cache.revoquer(utilisateurId, refreshTokenId);
  }

  /**
   * Fermer toutes les sessions demande de connaître leurs identifiants : un
   * cache ne sait pas énumérer ses clés sans balayer l'instance entière. Ils
   * sont donc lus dans la table **avant** de la vider — c'est ce que le proxy
   * apporte, et qu'aucun des deux supports ne saurait faire seul.
   */
  async revoquerToutes(utilisateurId: number): Promise<void> {
    const identifiants = await this.durable.identifiantsOuverts(utilisateurId);

    await this.durable.revoquerToutes(utilisateurId);
    await this.cache.revoquerPlusieurs(utilisateurId, identifiants);
  }

  private async ecrireDansLeCache(session: SessionRefresh): Promise<void> {
    try {
      await this.cache.enregistrer(session);
    } catch (err) {
      this.logger.warn(
        `Session ${session.refreshTokenId} non mise en cache — elle reste valide, servie depuis la base.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async rechauffer(
    utilisateurId: number,
    refreshTokenId: string,
  ): Promise<void> {
    // L'échéance exacte n'est pas relue : ce qui compte est que la clé
    // reparaisse, et la table restera de toute façon l'arbitre au prochain
    // renouvellement. Un TTL court suffit donc — c'est celui de la session en
    // cours qui borne réellement sa durée de vie.
    await this.ecrireDansLeCache({
      utilisateurId,
      refreshTokenId,
      expireLe: new Date(Date.now() + DUREE_RECHAUFFAGE_MS),
    });
  }
}

/**
 * Durée de remise en cache après un défaut : dix minutes.
 *
 * Assez pour absorber une rafale de renouvellements sans retourner en base,
 * assez court pour qu'une révocation manquée dans le cache — cas qui ne devrait
 * pas se produire, mais que rien n'empêche — se referme d'elle-même.
 */
const DUREE_RECHAUFFAGE_MS = 10 * 60 * 1000;
