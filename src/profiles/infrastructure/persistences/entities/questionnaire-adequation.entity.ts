import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Évaluation de l'investisseur au sens du règlement (UE) 2020/1503.
 *
 * Cette table porte trois choses distinctes, à ne pas confondre :
 *  - les critères objectifs de l'annexe II, qui déterminent l'éligibilité au
 *    statut d'averti ;
 *  - la base patrimoniale de l'art. 21(5), qui sert à simuler la capacité de
 *    perte et à calculer le seuil d'avertissement de l'art. 21(7) ;
 *  - le résultat du test de connaissances de l'art. 21(1), qui ne confère
 *    aucun statut et n'interdit jamais d'investir.
 */
@Entity('questionnaire_adequation')
export class QuestionnaireAdequationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  @Index({ unique: true })
  utilisateurId: number;

  // ── Annexe II, partie II — critères objectifs (personne physique) ────────

  /** Revenu brut personnel par exercice fiscal (seuil : 60 000 €). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  revenuBrutAnnuel: number | null;

  /** Portefeuille d'instruments financiers et dépôts (seuil : > 100 000 €). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  portefeuilleInstrumentsFinanciers: number | null;

  /** Au moins un an dans le secteur financier à un poste qualifiant, ou douze
   *  mois de direction d'une personne morale de la partie I. */
  @Column({ type: 'boolean', default: false })
  experienceProfessionnelleFinanciere: boolean;

  /** Nombre moyen d'opérations significatives par trimestre (seuil : 10). */
  @Column({ type: 'integer', default: 0 })
  transactionsMoyennesParTrimestre: number;

  // ── Annexe II, partie I — critères objectifs (personne morale) ───────────

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  fondsPropres: number | null;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  chiffreAffairesNet: number | null;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  totalBilan: number | null;

  // ── Art. 21(5) — base de la simulation de capacité de perte ──────────────

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  revenuAnnuel: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  actifsTotaux: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  engagementsFinanciers: number | null;

  /** L'investisseur a pris connaissance de sa capacité de perte simulée. */
  @Column({ type: 'boolean', default: false })
  simulationPerteAcceptee: boolean;

  // ── Art. 2(1)(j) — accès au statut d'averti ──────────────────────────────

  /** L'investisseur a expressément demandé à être traité comme averti. */
  @Column({ type: 'boolean', default: false })
  demandeStatutAverti: boolean;

  /** Il a accusé réception de l'avertissement sur la perte de protection. */
  @Column({ type: 'boolean', default: false })
  avertissementStatutAvertiAccepte: boolean;

  // ── Art. 21(1) à 21(4) — test de connaissances ───────────────────────────

  @Column({ type: 'integer', nullable: true })
  testConnaissancesScore: number | null;

  @Column({ type: 'integer', nullable: true })
  testConnaissancesTotal: number | null;

  /** Faux quand le score est sous le seuil : l'avertissement art. 21(4) est dû. */
  @Column({ type: 'boolean', nullable: true })
  testConnaissancesAdequat: boolean | null;

  /** Accusé de réception de l'avertissement d'inadéquation. */
  @Column({ type: 'boolean', default: false })
  avertissementInadequationAccepte: boolean;

  // ── Résultats calculés ───────────────────────────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  resultCategorie: string | null; // 'averti' | 'non_averti'

  /** Critères de l'annexe II effectivement remplis, pour la piste d'audit. */
  @Column({ type: 'jsonb', nullable: true })
  criteresRemplis: string[] | null;

  /** Patrimoine net au sens de l'art. 21(5). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  patrimoineNetCalcule: number | null;

  /** 10 % du patrimoine net — art. 21(5). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  capaciteDePerteSimulee: number | null;

  /** max(1 000 €, 5 % du patrimoine net) — art. 21(7). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  seuilAvertissementCalcule: number | null;

  /** Art. 21(2) : l'évaluation est réexaminée tous les deux ans. */
  @Column({ type: 'timestamptz', nullable: true })
  evalueeLe: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expireLe: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
