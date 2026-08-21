import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MfaMethodType } from 'src/iam/domains/enums/mfa-method.enum';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';

/**
 * Facteur d'authentification multifacteur enrôlé par un compte — **une seule
 * table, une seule classe**.
 *
 * Remplace l'héritage table unique (STI) `tfa_methods` et ses trois
 * `@ChildEntity` (`totp_methods`, `email_methods`, `sms_methods`). Le
 * discriminant `type_method` devient une colonne métier ordinaire, `method`,
 * et les trois colonnes concurrentes — `secretKeyOtp`, `emailOTP`,
 * `phoneNumberOTP`, dont deux étaient toujours nulles — deviennent
 * `credential`.
 *
 * Ce que le STI coûtait ici sans rien rendre : TypeORM n'ajoute pas le
 * discriminant à la clause `WHERE` d'un `UpdateQueryBuilder` sur une classe
 * fille, si bien que chaque écriture de masse devait passer par un `SELECT`
 * d'identifiants préalable sous peine d'emporter les facteurs des autres
 * canaux du même utilisateur. Le filtre est désormais explicite.
 *
 * La relation vers `UserEntity` reste **unidirectionnelle** : le
 * `@OneToMany` qui existait sur `UserEntity` n'était lu par personne et était
 * chargé à chaque lecture de compte.
 */
@Entity('mfa_methods')
@Index('IDX_mfa_methods_user_method', ['user', 'method'])
/**
 * Unicité héritée de l'ancienne colonne `emailOTP`, restreinte au canal
 * email : sur une colonne partagée par les trois canaux, une contrainte
 * globale mettrait en concurrence des secrets TOTP, des numéros et des
 * adresses. Déclarée ici et pas seulement dans la migration, sans quoi le
 * prochain `migration:generate` proposerait de la supprimer.
 */
@Index('UQ_mfa_methods_email_credential', ['credential'], {
  unique: true,
  where: `"method" = 'email'`,
})
/**
 * Invariant du contexte, tenu par le schéma : **au plus un facteur actif par
 * compte**, tous canaux confondus. Le code l'applique déjà à l'activation ;
 * l'index garantit qu'aucun chemin d'écriture futur ne pourra le contourner
 * sans que Postgres refuse l'écriture.
 */
@Index('UQ_mfa_methods_single_active', ['user'], {
  unique: true,
  where: `"isActive"`,
})
export class MfaMethodEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 16 })
  method: MfaMethodType;

  /**
   * `select: false` — hérité de l'ancien `secretKeyOtp`, et désormais appliqué
   * aux trois canaux : cette colonne porte le secret TOTP chiffré, qui ne doit
   * jamais partir dans un `find()` de passage. Le repository est le seul
   * endroit qui la réintroduit, explicitement.
   */
  @Column({ select: false })
  credential: string;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  activatedDate: Date;

  @ManyToOne(() => UserEntity)
  // Contrainte nommée explicitement, comme dans la migration : sans cela
  // TypeORM attend son propre nom haché et chaque `migration:generate` futur
  // proposerait de recréer cette clé étrangère à l'identique.
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_mfa_methods_user',
  })
  user: UserEntity;
}
