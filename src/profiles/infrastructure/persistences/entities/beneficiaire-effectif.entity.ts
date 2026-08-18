import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfilPMEntity } from './profil-pm.entity';

@Entity('beneficiaire_effectif')
export class BeneficiaireEffectifEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  @Index()
  profilPMId: number;

  @ManyToOne(() => ProfilPMEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profilPMId' })
  profilPM: ProfilPMEntity;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'date', nullable: true })
  dateNaissance: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nationalite: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  pourcentageDetention: number; // ex: 33.33

  @Column({ type: 'varchar', nullable: true })
  pieceIdentiteDocId: string | null; // FK vers Document

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
