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

  /**
   * La société dont cette personne est bénéficiaire.
   *
   * Portait le `utilisateurId` du titulaire, du temps où celui-ci tenait lieu
   * de clé au dossier moral. Un compte pouvant désormais en déclarer
   * plusieurs, l'ancienne valeur ne désignait plus une société mais un
   * ensemble : les bénéficiaires de toutes les sociétés d'un même dirigeant se
   * seraient confondus.
   */
  @Column({ type: 'uuid' })
  @Index()
  profilPMId: string;

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
