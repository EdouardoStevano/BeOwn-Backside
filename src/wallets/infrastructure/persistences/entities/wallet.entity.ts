import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
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

  /** Solde disponible, immédiatement utilisable par le titulaire. */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  solde: number;

  /**
   * Fonds engagés mais non définitifs : souscriptions encore couvertes par le
   * délai de réflexion de l'art. 22 du règlement (UE) 2020/1503. Ils ne sont ni
   * disponibles pour l'investisseur, ni mis à disposition du porteur de projet.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  soldeBloque: number;

  @Column({ type: 'varchar', default: 'actif' })
  statut: string;

  @CreateDateColumn()
  createdAt: Date;
}
