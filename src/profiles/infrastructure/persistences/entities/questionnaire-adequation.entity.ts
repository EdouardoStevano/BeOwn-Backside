import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity('questionnaire_adequation')
export class QuestionnaireAdequationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  @Index({ unique: true })
  utilisateurId: number;

  // ── Étape 1 : Pré-qualification (professionnel ?) ──────────────────────
  @Column({ type: 'boolean', default: false })
  workInFinancialSector: boolean;

  @Column({ type: 'boolean', default: false })
  moreThan10TransactionsPerQuarter: boolean;

  @Column({ type: 'boolean', default: false })
  portfolioOver500k: boolean;

  // ── Étape 2 : Qualification (averti ou non_averti ?) ───────────────────
  @Column({ type: 'boolean', default: false })
  previousUnlistedInvestments: boolean;

  @Column({ type: 'boolean', default: false })
  investmentExperienceOver5Years: boolean;

  @Column({ type: 'boolean', default: false })
  financialPatrimonyOver500k: boolean;

  @Column({ type: 'boolean', default: false })
  understandsTotalLossRisk: boolean;

  @Column({ type: 'boolean', default: false })
  financialSectorBackground: boolean;

  // ── Étape 3 : Simulation capacité de perte (non_averti) ────────────────
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  patrimoineNet: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  revenuAnnuel: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  budgetAnnuelInvestissement: number | null;

  @Column({ type: 'boolean', default: false })
  acceptsSimulatedLoss: boolean;

  // ── Résultat calculé ───────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  resultCategorie: string | null; // 'professionnel' | 'averti' | 'non_averti'

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  resultMontantMaxConseille: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
