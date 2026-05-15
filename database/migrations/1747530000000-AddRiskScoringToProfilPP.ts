import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRiskScoringToProfilPP1747530000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profil_personne_physique"
        ADD COLUMN IF NOT EXISTS "niveauRisque" character varying NULL,
        ADD COLUMN IF NOT EXISTS "dernierContactAdmin" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "prochainContactDu" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profil_personne_physique"
        DROP COLUMN IF EXISTS "niveauRisque",
        DROP COLUMN IF EXISTS "dernierContactAdmin",
        DROP COLUMN IF EXISTS "prochainContactDu"
    `);
  }
}
