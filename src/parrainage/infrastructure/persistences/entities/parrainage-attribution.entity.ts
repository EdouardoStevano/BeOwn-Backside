import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StatutAttributionParrainage } from 'src/parrainage/domains/enums/statut-attribution-parrainage.enum';

/**
 * Attribution du bonus de parrainage — UNE ligne par filleul, à vie.
 *
 * C'est la contrainte UNIQUE sur `filleulId` qui porte la règle métier « seul
 * le PREMIER investissement définitif du filleul déclenche le bonus » : deux
 * confirmations concurrentes (cron + souscription directe, ou deux réplicas)
 * ne peuvent pas créer deux attributions — la seconde échoue en 23505 et est
 * traitée comme un rejeu sans effet. L'idempotence est donc adossée à la
 * base, pas à la mémoire d'un processus.
 *
 * Les montants CRÉDITÉS (après plafond annuel) sont figés ici : le relevé de
 * l'utilisateur et le calcul du restant annuel relisent ces colonnes, jamais
 * un recalcul « taux × montant » qui divergerait si le taux configuré change.
 *
 * Colonnes de référence (`parrainId`, `filleulId`, `investissementId`) sans
 * FK dure, comme `distribution_part` : le style du schéma privilégie les
 * colonnes indexées, et la pose du schéma est manuelle
 * (docs/adr/ADR-migrations-hors-deploiement.md).
 */
@Entity('parrainage_attribution')
// Le plafond annuel d'un parrain se calcule en sommant ses bonus de l'année :
// filtre (parrainId, creeLe) — sans cet index, chaque attribution balaie la
// table entière.
@Index(['parrainId', 'creeLe'])
export class ParrainageAttributionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  parrainId: number;

  /** UNIQUE : un filleul ne déclenche qu'une seule attribution, la première. */
  @Column({ type: 'integer', unique: true })
  filleulId: number;

  /** Investissement définitif qui a déclenché l'attribution. */
  @Column({ type: 'uuid' })
  investissementId: string;

  /** Montant de l'investissement déclencheur (base de calcul des bonus). */
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  montantBase: number;

  /** Bonus réellement crédité au parrain (0 si plafond annuel épuisé). */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  bonusParrainEur: number;

  /** Bonus réellement crédité au filleul (0 si plafond annuel épuisé). */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  bonusFilleulEur: number;

  @Column({ type: 'varchar', default: StatutAttributionParrainage.CREDITEE })
  statut: StatutAttributionParrainage;

  @CreateDateColumn({ type: 'timestamptz' })
  creeLe: Date;
}
