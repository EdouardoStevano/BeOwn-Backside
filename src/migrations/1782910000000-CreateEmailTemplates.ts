import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Table email_templates (feat/euro-comms-suppression, V2-T1) : modèles
 * d'emails transactionnels éditables par les admins.
 *
 * `key` = nom du fichier .hbs historique sans extension (activation,
 * kyc-validated…). Les lignes sont seedées au bootstrap depuis les .hbs du
 * code (EmailTemplateService.seedDefaults, idempotent, jamais d'écrasement) ;
 * cette migration ne crée que la structure. En dev (synchronize) la table
 * existe déjà : CREATE TABLE IF NOT EXISTS la rend rejouable partout.
 */
export class CreateEmailTemplates1782910000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "email_templates" (
        "key" character varying(120) NOT NULL,
        "nom" character varying(200) NOT NULL,
        "description" text,
        "sujet" character varying(300) NOT NULL,
        "corpsHtml" text NOT NULL,
        "variables" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedBy" character varying(200),
        CONSTRAINT "PK_email_templates_key" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_templates"`);
  }
}
