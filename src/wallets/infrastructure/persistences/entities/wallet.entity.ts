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

/**
 * Un projet ne peut porter qu'UN wallet par type. Un doublon scinderait le
 * solde du projet en deux et rendrait le montant dû au porteur incalculable :
 * l'index unique partiel transforme une course résiduelle en erreur bruyante
 * plutôt qu'en désalignement silencieux du grand livre. Partiel, parce que la
 * très grande majorité des wallets (investisseurs, frais, séquestres) ont
 * `projetId` à NULL et doivent rester libres de coexister.
 */
@Index('UQ_wallet_projet_type', ['projetId', 'type'], {
  unique: true,
  where: '"projetId" IS NOT NULL',
})
/**
 * Symétrique pour les portefeuilles PERSONNELS : un compte ne peut porter
 * qu'UN portefeuille par type.
 *
 * Le portefeuille investisseur est résolu partout par
 * `findOne({ proprietaireUserId, type })` — une lecture qui rend la PREMIÈRE
 * ligne trouvée. Un doublon, créé par deux requêtes concurrentes (le dépôt
 * comme la première consultation créent le portefeuille à la volée), scinderait
 * le solde d'une personne en deux : un crédit sur l'un, un débit sur l'autre,
 * et un « solde insuffisant » sur un compte pourtant approvisionné. L'index
 * transforme cette course en erreur bruyante.
 *
 * Partiel de la même façon : les portefeuilles de plateforme (frais, taxes,
 * séquestres) ont `proprietaireUserId` à NULL et doivent coexister.
 * Pose en base : hors déploiement, cf. docs/adr/ADR-migrations-hors-deploiement.md.
 */
@Index('UQ_wallet_proprietaire_type', ['proprietaireUserId', 'type'], {
  unique: true,
  where: '"proprietaireUserId" IS NOT NULL',
})
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
   * délai de réflexion que BeOwn accorde aux investisseurs non avertis
   * (`investments/domains/retractation.ts`). Ils ne sont ni disponibles pour
   * l'investisseur, ni mis à disposition du porteur de projet.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  soldeBloque: number;

  @Column({ type: 'varchar', default: 'actif' })
  statut: string;

  @CreateDateColumn()
  createdAt: Date;
}
