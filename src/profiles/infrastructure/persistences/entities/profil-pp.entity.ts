import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { CategoriePsfp } from 'src/profiles/domains/enums/kyc-status.enum';

@Entity('profil_personne_physique')
export class ProfilPPEntity {
  @PrimaryColumn()
  utilisateurId: number;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateurId' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', nullable: true })
  civilite: string | null;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'varchar', nullable: true })
  nomNaissance: string | null;

  @Column({ type: 'date', nullable: true })
  dateNaissance: Date | null;

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

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  patrimoineDeclare: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantMaxConseille: number | null;

  @Column({ type: 'varchar', nullable: true })
  niveauRisque: string | null; // 'vulnerable' | 'modere' | 'qualifie'

  @Column({ type: 'timestamptz', nullable: true })
  dernierContactAdmin: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  prochainContactDu: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
