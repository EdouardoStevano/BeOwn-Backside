import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import {
  OrdreMarcheSens,
  OrdreMarcheStatus,
} from 'src/secondarymarket/domains/ordre-marche';

@Entity('ordre_marche')
export class OrdreMarcheEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'investissementId' })
  @Index()
  investissementId: string;

  @ManyToOne(() => InvestmentEntity, { eager: false })
  @JoinColumn({ name: 'investissementId' })
  investissement: InvestmentEntity;

  @Column({ type: 'integer', name: 'vendeurId' })
  @Index()
  vendeurId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'vendeurId' })
  vendeur: UserEntity;

  @Column({ type: 'integer', nullable: true })
  acheteurId: number | null;

  @Column({ type: 'varchar' })
  sens: OrdreMarcheSens;

  @Column({ type: 'integer', default: 0 })
  nbFractions: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  prixUnitaire: number;

  @Column({ type: 'varchar', default: OrdreMarcheStatus.EN_CARNET })
  statut: OrdreMarcheStatus;

  /** Quantité sur laquelle porte l'intérêt exprimé par l'acheteur (art. 25). */
  @Column({ type: 'integer', nullable: true })
  interetNbFractions: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  interetExprimeLe: Date | null;

  @Column({ type: 'date', nullable: true })
  valideJusquAu: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
