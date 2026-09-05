import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Liste interne des personnes visées par une mesure de gel des avoirs
 * (art. L. 562-4 CMF) — saisie MANUELLE par l'équipe compliance depuis le
 * registre national des gels, en attendant un fournisseur de screening
 * (arbitrage budgétaire fondateur, cf. docs/adr/ADR-gel-des-avoirs.md).
 *
 * Minimisation stricte (§ 4.3 du document de conformité) : ces lignes
 * concernent des personnes potentiellement TIERCES à la plateforme — nom,
 * prénom, date de naissance, motif et source, rien de plus.
 *
 * Table ajoutée via décorateurs + SQL manuel réversible
 * (docs/adr/ADR-migrations-hors-deploiement.md, entrée 2026-09-03 gel).
 */
@Entity('personne_gelee')
export class PersonneGeleeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'varchar' })
  prenom: string;

  @Column({ type: 'date', nullable: true })
  dateNaissance: string | null;

  @Column({ type: 'varchar', length: 500 })
  motif: string;

  /** Provenance de l'inscription, ex. « registre national des gels — saisie manuelle ». */
  @Column({ type: 'varchar' })
  source: string;

  /** Désactivation logique (radiation du registre) — jamais de DELETE : trace. */
  @Column({ type: 'boolean', default: true })
  actif: boolean;

  /**
   * Date de la radiation, `null` tant que la mesure est en vigueur.
   *
   * Le drapeau `actif` seul ne disait pas QUAND la mesure avait été levée : ces
   * lignes, qui décrivent des personnes potentiellement tierces à la
   * plateforme, n'avaient donc aucune durée de conservation calculable. C'est
   * le point de départ des 5 ans de la finalité `liste_gel_levee`
   * (`src/rgpd/domains/retention-policy.ts`).
   *
   * Le stock radié avant la pose de la colonne reste à `null` — aucun backfill :
   * une date de levée ne s'invente pas. Ces lignes ne sont pas purgées et
   * attendent une reprise manuelle par la conformité.
   * Colonne ajoutée via décorateur + SQL manuel (ADR migrations).
   */
  @Column({ type: 'timestamptz', nullable: true })
  desactiveLe: Date | null;

  /** userId de l'admin compliance qui a saisi la ligne. */
  @Column({ type: 'integer' })
  creePar: number;

  @CreateDateColumn({ type: 'timestamptz' })
  creeLe: Date;
}
