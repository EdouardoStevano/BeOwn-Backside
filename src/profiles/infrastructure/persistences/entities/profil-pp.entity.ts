import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';

@Entity('profil_personne_physique')
export class ProfilPPEntity {
  @PrimaryColumn()
  utilisateurId: number;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', nullable: true })
  civilite: string | null;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'varchar', nullable: true })
  nomNaissance: string | null;

  @Column({ type: 'date' })
  dateNaissance: Date;

  @Column({ type: 'varchar', nullable: true })
  lieuNaissance: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  paysNaissance: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  nationalite: string | null;

  @Column({ type: 'varchar', nullable: true })
  adresseLigne1: string | null;

  @Column({ type: 'varchar', nullable: true })
  adresseLigne2: string | null;

  @Column({ type: 'varchar', nullable: true })
  codePostal: string | null;

  @Column({ type: 'varchar', nullable: true })
  ville: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  pays: string | null;

  @Column({ type: 'varchar', nullable: true })
  telephone: string | null;

  @Column({ type: 'varchar', nullable: true })
  profession: string | null;

  @Column({ type: 'varchar', nullable: true })
  secteurActivite: string | null;

  @Column({ default: false })
  pep: boolean;

  @Column({ type: 'char', length: 2, nullable: true })
  residenceFiscale: string | null;

  @Column({ type: 'varchar', nullable: true })
  nif: string | null;

  @Column({ type: 'varchar', default: CategoriePsfp.NON_AVERTI })
  categoriePsfp: CategoriePsfp;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
