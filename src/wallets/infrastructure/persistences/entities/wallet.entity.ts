import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

@Entity('wallet')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: WalletType;

  @Column({ type: 'integer', nullable: true })
  @Index()
  proprietaireUserId: number | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'proprietaireUserId' })
  proprietaire: UserEntity;

  @Column({ type: 'uuid', nullable: true })
  projetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  spvId: string | null;

  @Column({ type: 'varchar' })
  fournisseurRef: string;

  @Column({ type: 'char', length: 3, default: 'EUR' })
  devise: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  solde: number;

  @Column({ type: 'varchar', default: 'actif' })
  statut: string;

  @CreateDateColumn()
  createdAt: Date;
}
