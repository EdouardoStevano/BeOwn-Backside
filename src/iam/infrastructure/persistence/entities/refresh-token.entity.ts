import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Session de rafraîchissement, telle qu'elle survit à un redémarrage du cache.
 *
 * Le refresh token n'existait qu'en Redis : un `FLUSHALL`, une éviction sous
 * pression mémoire ou un redémarrage du conteneur déconnectait **tous** les
 * utilisateurs à l'expiration de leur access token. La table est la source
 * durable ; le cache reste devant pour la vitesse (voir
 * `CacheFirstSessionStoreProxy`).
 *
 * Aucune relation vers `UserEntity` : un agrégat en référence un autre par
 * identifiant, jamais par objet (§12.7). La colonne porte donc `utilisateurId`
 * sans clé étrangère déclarée côté ORM.
 */
@Entity('refresh_tokens')
// Les deux accès du port : valider un couple (compte, identifiant) et fermer
// toutes les sessions d'un compte. L'unicité empêche par ailleurs qu'un même
// identifiant de rotation soit enregistré deux fois.
@Index(
  'UQ_refresh_tokens_utilisateur_token',
  ['utilisateurId', 'refreshTokenId'],
  {
    unique: true,
  },
)
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  utilisateurId: number;

  @Column({ type: 'varchar', length: 64 })
  refreshTokenId: string;

  /**
   * Échéance de la session. Une ligne périmée n'ouvre plus rien : la lecture
   * la filtre, et la prochaine ouverture de session du même compte la purge.
   */
  @Column({ type: 'timestamptz' })
  expireLe: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
