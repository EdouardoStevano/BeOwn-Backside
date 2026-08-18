import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletType } from 'src/wallets/domains/enums/wallet.enum';

@Entity('wallet')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: WalletType;

  /**
   * Le propriétaire, **par identité seule**. La relation `proprietaire` vers
   * `UserEntity` n'était chargée par aucune requête et faisait dépendre Wallets
   * de l'infrastructure d'IAM (§12.7) ; le portefeuille d'un projet n'a de
   * toute façon pas de titulaire, d'où le `null`.
   *
   * La clé étrangère en base est posée par migration et reste en place.
   */
  @Column({ type: 'integer', nullable: true })
  @Index()
  proprietaireUserId: number | null;

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
