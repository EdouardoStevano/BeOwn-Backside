import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { EcheanceEntity } from './echeance.entity';

@Entity('investissement')
export class InvestmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  projetId: string;

  @ManyToOne(() => ProjectEntity)
  @JoinColumn({ name: 'projet_id' })
  projet: ProjectEntity;

  @Column({ type: 'integer' })
  @Index()
  utilisateurId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'varchar' })
  instrument: string;

  @Column({ type: 'integer', nullable: true })
  nbTitres: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  valeurTitre: number | null;

  @Column({ type: 'varchar', default: InvestmentStatus.INITIE })
  statut: InvestmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  delaiRetractationJusquAu: Date | null;

  @Column({ type: 'uuid', nullable: true })
  bulletinDocId: string | null;

  @Column({ type: 'uuid', nullable: true })
  signatureId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reservationId: string | null;

  @OneToMany(() => EcheanceEntity, (e) => e.investissement, { cascade: true })
  echeances: EcheanceEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
