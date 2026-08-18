import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('profil_personne_morale')
export class ProfilPMEntity {
  /** @see ProfilPPEntity.utilisateurId — référence par identité, sans relation. */
  @PrimaryColumn()
  utilisateurId: number;

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
