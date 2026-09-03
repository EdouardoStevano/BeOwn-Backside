import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Écriture du grand livre interne.
 *
 * DEUX colonnes de portefeuille, et deux seulement : `walletSource` (débité)
 * et `walletDestination` (crédité). Une contrepartie hors plateforme (dépôt
 * par carte, retrait bancaire, versement au porteur) laisse l'autre côté à
 * NULL — c'est le seul cas légitime.
 *
 * HISTORIQUE — ANO-02 : le schéma portait une TROISIÈME colonne `wallet_source`
 * (propriété `walletId`), doublon orphelin de `walletSource`. Les dépôts y
 * inscrivaient le portefeuille BÉNÉFICIAIRE, donc du côté débiteur, et le
 * rapprochement « Σ crédits − Σ débits = solde » divergeait à chaque dépôt.
 * La colonne a été supprimée ; ne pas la réintroduire. Rattrapage des données
 * existantes : docs/adr/ADR-grand-livre-deux-colonnes.md.
 */
// Index de service des chemins chauds : la file des retraits et le balayage de
// rattrapage filtrent (type, statut) puis trient par ancienneté ; les exports
// et le nettoyage des dépôts abandonnés balaient (statut, createdAt). Sans eux,
// chaque passage est un scan complet d'une table qui ne fait que grossir.
// Pose en base : hors déploiement, cf. docs/adr/ADR-migrations-hors-deploiement.md.
@Index(['statut', 'createdAt'])
@Index(['type', 'statut'])
@Entity('transaction_paiement')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Portefeuille DÉBITÉ. NULL si la contrepartie est externe (dépôt). */
  @Column({ type: 'uuid', nullable: true })
  walletSource: string | null;

  /** Portefeuille CRÉDITÉ. NULL si la contrepartie est externe (retrait). */
  @Column({ type: 'uuid', nullable: true })
  walletDestination: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montant: number;

  @Column({ type: 'char', length: 3, default: 'EUR' })
  devise: string;

  @Column({ type: 'varchar' })
  type: TransactionType;

  @Column({ type: 'varchar', nullable: true })
  referenceExterne: string | null;

  @Column({ type: 'varchar', default: TransactionFournisseur.STRIPE })
  fournisseur: TransactionFournisseur;

  @Column({ type: 'varchar', nullable: true })
  fournisseurRef: string | null;

  @Column({ type: 'varchar', default: TransactionStatus.INITIE })
  statut: TransactionStatus;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  investissementId: string | null;

  @Column({ type: 'uuid', nullable: true })
  echeanceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reservationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  projetId: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fraisPsp: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  fraisPlateforme: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  motifEchec: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
