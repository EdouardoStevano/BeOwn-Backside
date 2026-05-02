import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructures/persistences/entities/user.entity';
import {
  KycNiveau,
  KycStatus,
} from 'src/profiles/domains/enums/kyc-status.enum';

@Entity('kyc')
export class KycEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  utilisateurId: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'utilisateur_id' })
  utilisateur: UserEntity;

  @Column({ type: 'varchar', default: KycStatus.NON_DEMARRE })
  statut: KycStatus;

  @Column({ type: 'varchar', default: KycNiveau.STANDARD })
  niveau: KycNiveau;

  @Column({ type: 'integer', nullable: true })
  scoreRisque: number | null;

  @Column({ type: 'varchar', default: 'stripe' })
  fournisseur: string;

  @Column({ type: 'varchar', nullable: true })
  fournisseurRef: string | null;

  @Column({ type: 'date', nullable: true })
  valideJusquAu: Date | null;

  @Column({ type: 'varchar', nullable: true })
  motifRefus: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
