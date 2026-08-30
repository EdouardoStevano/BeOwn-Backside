import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfilPMEntity } from './profil-pm.entity';

/**
 * Au nom de qui un compte agit — une ligne par compte, au plus.
 *
 * `userId` est la clé primaire : un compte n'agit que pour une identité à la
 * fois, et l'unicité le dit là où elle se lit plutôt que dans un index à part.
 *
 * **`societeId` nul signifie « en son nom propre »**, et non « pas encore
 * choisi ». Les deux se confondent volontairement : un compte qui n'a jamais
 * basculé agit pour lui-même, ce qui est exactement ce que la colonne vide
 * représente. Distinguer les deux états aurait ajouté un cas sans conséquence.
 *
 * L'absence de ligne se lit de la même façon — voir
 * `ProfilInvestisseurActifTypeOrmRepository.lire`, qui rend la personne
 * physique plutôt que `null`.
 */
@Entity('profil_investisseur_actif')
export class ProfilInvestisseurActifEntity {
  @PrimaryColumn({ type: 'integer' })
  userId: number;

  /**
   * La société pour laquelle le compte agit, `null` pour son nom propre.
   *
   * `ON DELETE SET NULL`, et c'est délibéré : si la société active est
   * supprimée, le compte doit retomber sur son nom propre — le repli
   * protecteur — et non voir sa ligne disparaître avec elle, ce qu'un
   * `CASCADE` aurait fait sans qu'on s'en aperçoive.
   */
  @Column({ type: 'uuid', nullable: true })
  societeId: string | null;

  @ManyToOne(() => ProfilPMEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'societeId' })
  societe: ProfilPMEntity | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  basculeLe: Date;
}
