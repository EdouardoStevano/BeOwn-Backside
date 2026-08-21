import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  SessionRefresh,
  SessionStore,
} from 'src/iam/application/ports/session-store.port';
import { RefreshTokenEntity } from 'src/iam/infrastructure/persistence/entities/refresh-token.entity';

/**
 * Support **durable** des sessions — la source de vérité.
 *
 * Il n'est pas branché directement sur `TokenService` : une lecture en base à
 * chaque renouvellement de token serait payer cher ce que le cache rend en une
 * milliseconde. C'est `CacheFirstSessionStoreProxy` qui le place derrière le
 * cache, et qui n'y descend qu'à défaut.
 */
@Injectable()
export class TypeOrmSessionStore implements SessionStore {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly sessions: Repository<RefreshTokenEntity>,
  ) {}

  async enregistrer(session: SessionRefresh): Promise<void> {
    // Purge opportuniste plutôt qu'un cron : ouvrir une session est le moment
    // exact où l'on sait qu'un compte en a peut-être laissé derrière lui, et
    // le balayage reste borné à ses propres lignes.
    await this.sessions.delete({
      utilisateurId: session.utilisateurId,
      expireLe: LessThan(new Date()),
    });

    await this.sessions.save(
      this.sessions.create({
        utilisateurId: session.utilisateurId,
        refreshTokenId: session.refreshTokenId,
        expireLe: session.expireLe,
      }),
    );
  }

  async estValide(
    utilisateurId: number,
    refreshTokenId: string,
  ): Promise<boolean> {
    const session = await this.sessions.findOne({
      where: { utilisateurId, refreshTokenId },
      select: ['expireLe'],
    });

    // L'échéance est éprouvée ici et pas seulement par le TTL du cache : une
    // ligne survit à son expiration jusqu'à la prochaine purge.
    return session !== null && session.expireLe.getTime() > Date.now();
  }

  async revoquer(utilisateurId: number, refreshTokenId: string): Promise<void> {
    await this.sessions.delete({ utilisateurId, refreshTokenId });
  }

  async revoquerToutes(utilisateurId: number): Promise<void> {
    await this.sessions.delete({ utilisateurId });
  }

  /**
   * Identifiants des sessions ouvertes d'un compte.
   *
   * Hors du port : c'est un besoin du seul proxy, qui doit savoir quelles
   * clés de cache retirer quand on ferme toutes les sessions — le cache ne
   * sait pas énumérer les siennes.
   */
  async identifiantsOuverts(utilisateurId: number): Promise<string[]> {
    const sessions = await this.sessions.find({
      where: { utilisateurId },
      select: ['refreshTokenId'],
    });

    return sessions.map((session) => session.refreshTokenId);
  }
}
