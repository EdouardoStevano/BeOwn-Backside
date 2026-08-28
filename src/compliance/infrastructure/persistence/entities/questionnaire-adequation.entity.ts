import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
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

  /**
   * Le dossier de conformité auquel cette pièce appartient — relation 1:1.
   *
   * C'était `utilisateurId`, une colonne vers `users` : la pièce se rattachait
   * au compte par-dessus sa racine. Elle ne connaît plus que celle-ci, qui est
   * la seule à savoir de quel titulaire il s'agit (§6). `unique` porte le 1:1 :
   * un dossier de conformité n'a qu'un questionnaire.
   */
  @Column({ type: 'uuid' })
  @Index({ unique: true })
  profileId: string;

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

  // ── Avancement : quelle étape a été répondue, et quand ─────────────────
  //
  // `null` tant que l'étape ne l'a pas été. Ces trois dates sont ce qui rend
  // une étape répondue **discernable** d'une étape jamais ouverte : toutes les
  // réponses des étapes 1 et 2 sont des booléens qui valent `false` par défaut,
  // si bien que répondre « non » partout produit exactement la ligne de qui n'a
  // rien rempli. Voir `AvancementQuestionnaire`.

  @Column({ type: 'timestamptz', nullable: true })
  preQualificationRepondueLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  qualificationRepondueLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  capaciteRepondueLe: Date | null;

  // ── Résultat calculé ───────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  resultCategorie: CategoriePsfp | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  resultMontantMaxConseille: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
