import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Modèle d'email transactionnel éditable par les admins (V2-T2 : CRUD +
 * preview + test-send). Une ligne par événement déclencheur.
 *
 * `key` = nom du fichier .hbs historique sans extension (ex. "activation",
 * "kyc-validated"…) : c'est la clé passée à EmailTemplateService.render()
 * par les transports (brevo/mailpit). Les lignes manquantes sont seedées
 * au bootstrap depuis les .hbs du code (seedDefaults) ; une ligne existante
 * n'est JAMAIS écrasée par le seed.
 */
@Entity('email_templates')
export class EmailTemplateEntity {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  key: string;

  /** Nom lisible affiché dans l'admin (ex. « Activation du compte »). */
  @Column({ type: 'varchar', length: 200 })
  nom: string;

  /** Événement déclencheur, descriptif pour l'admin. */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Sujet de l'email — template Handlebars (ex. « Nouveau projet : {{titre}} »). */
  @Column({ type: 'varchar', length: 300 })
  sujet: string;

  /** Corps HTML — template Handlebars SANS header/footer (injectés par le layout fixe). */
  @Column({ type: 'text' })
  corpsHtml: string;

  /** Variables disponibles dans le sujet/corps (palette côté admin). */
  @Column({ type: 'jsonb', default: [] })
  variables: string[];

  /** Désactivé → render() renvoie null et l'email n'est pas envoyé. */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Email/id de l'admin ayant fait la dernière modification (null = seed). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null;
}
