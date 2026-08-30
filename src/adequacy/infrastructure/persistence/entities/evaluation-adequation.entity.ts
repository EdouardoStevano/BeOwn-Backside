import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoriePsfp } from 'src/adequacy/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';

/**
 * L'évaluation d'adéquation d'un investisseur — la table de sa racine.
 *
 * Ses colonnes vivaient sur `investor_compliance_profile`, aux côtés du dossier
 * de vérification et du verdict KYB. Deux agrégats sur une même ligne
 * s'écrasent : chacun écrivant la ligne entière, celui qui enregistre un
 * questionnaire remettrait le KYB à la valeur qu'il a lue, et réciproquement.
 * La séparation des contextes imposait de toute façon la séparation des tables
 * — une base partagée entre deux Bounded Contexts est ce que §3 proscrit.
 *
 * **L'identifiant est repris tel quel** de la ligne d'origine : le
 * questionnaire référençait `investor_compliance_profile.id`, il référence
 * désormais `evaluation_adequation.id` sans qu'aucune valeur n'ait bougé. La
 * migration ne déplace pas de clé, elle repointe une contrainte.
 *
 * Deux index partiels pour l'unicité, comme la table dont elle est issue :
 * `NULL` n'étant jamais égal à `NULL` dans un index unique Postgres, une
 * contrainte à deux colonnes laisserait passer autant de lignes de titulaire
 * qu'on veut.
 */
@Entity('evaluation_adequation')
export class EvaluationAdequationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** L'investisseur — un compte en porte plusieurs évaluations, une par profil. */
  @Column()
  @Index()
  userId: number;

  /**
   * La société dont cette évaluation porte le classement — `null` pour celle du
   * titulaire lui-même.
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  souscripteurSocieteId: string | null;

  // ── Le classement PSFP ────────────────────────────────────────────────────

  @Column({ type: 'varchar', default: CategoriePsfp.NON_AVERTI })
  categoriePsfp: CategoriePsfp;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  patrimoineDeclare: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantMaxConseille: number | null;

  // ── La surveillance périodique (PSFP art. 21) ─────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  niveauRisque: NiveauRisque | null;

  @Column({ type: 'timestamptz', nullable: true })
  dernierContactAdmin: Date | null;

  /** Indexée : le CRON quotidien balaie la table par cette colonne. */
  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  prochainContactDu: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
