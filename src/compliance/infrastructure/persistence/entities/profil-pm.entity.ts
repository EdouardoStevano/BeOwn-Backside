import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('profil_personne_morale')
export class ProfilPMEntity {
  /** @see ProfilPPEntity.id */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * @see ProfilPPEntity.userId — référence par identité, sans relation.
   *
   * Indexée mais **non unique**, à la différence du dossier physique : un
   * compte peut déclarer plusieurs sociétés — et il porte en plus son dossier
   * physique, qui est l'identité du représentant légal de chacune d'elles. Une
   * clé étrangère composée `(userId, nature)` l'en a empêché un temps ; voir
   * `ProfilsPPEtPMCoexistent1784100000000`.
   */
  @Column()
  @Index()
  userId: number;

  @Column({ type: 'varchar' })
  raisonSociale: string;

  @Column({ type: 'varchar', nullable: true })
  formeJuridique: string | null;

  @Column({ type: 'varchar', nullable: true })
  siren: string | null;

  @Column({ type: 'varchar', nullable: true })
  rcsVille: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  capitalSocial: number | null;

  @Column({ type: 'varchar', nullable: true })
  siegeAdresse: string | null;

  @Column({ type: 'integer', nullable: true })
  representantId: number | null;

  @Column({ type: 'varchar', nullable: true })
  secteurActivite: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
