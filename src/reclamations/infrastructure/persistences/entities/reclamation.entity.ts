import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CategorieReclamation,
  StatutReclamation,
} from 'src/reclamations/domains/reclamation';

/**
 * Réclamation client — art. 27 du règlement (UE) 2020/1503.
 *
 * Les enregistrements sont conservés : l'art. 26 impose cinq ans de
 * conservation des données relatives aux services fournis. Une réclamation
 * n'est donc jamais supprimée, seulement close.
 */
@Entity('reclamation')
export class ReclamationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  reference: string;

  @Column({ type: 'integer' })
  @Index()
  utilisateurId: number;

  @Column({ type: 'varchar' })
  categorie: CategorieReclamation;

  @Column({ type: 'varchar' })
  objet: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  projetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  investissementId: string | null;

  @Column({ type: 'varchar', default: StatutReclamation.RECUE })
  @Index()
  statut: StatutReclamation;

  @Column({ type: 'timestamptz', nullable: true })
  accuseReceptionLe: Date | null;

  @Column({ type: 'text', nullable: true })
  reponse: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reponduLe: Date | null;

  @Column({ type: 'integer', nullable: true })
  traiteParUserId: number | null;

  /** Échéance de la réponse motivée, figée à la réception. */
  @Column({ type: 'timestamptz' })
  echeanceReponse: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
