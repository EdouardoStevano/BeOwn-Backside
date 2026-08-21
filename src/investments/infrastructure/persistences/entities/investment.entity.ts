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
import { SignatureEntity } from 'src/signatures/infrastructure/persistences/entities/signature.entity';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
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
  @JoinColumn({ name: 'projetId' })
  projet: ProjectEntity;

  @Column({ type: 'integer' })
  @Index()
  utilisateurId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateurId' })
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

  @ManyToOne(() => SignatureEntity, { nullable: true, eager: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'signatureId' })
  signature?: SignatureEntity;

  @Column({ type: 'uuid', nullable: true })
  reservationId: string | null;

  @OneToMany(() => EcheanceEntity, (e) => e.investissement, { cascade: true })
  echeances: EcheanceEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
