import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToProfilPP1780000000000
  implements MigrationInterface
{
  name = 'AddMissingColumnsToProfilPP1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profil_personne_physique"
        ADD COLUMN IF NOT EXISTS "prenom"        varchar,
        ADD COLUMN IF NOT EXISTS "nom"           varchar,
        ADD COLUMN IF NOT EXISTS "nomNaissance"  varchar,
        ADD COLUMN IF NOT EXISTS "paysNaissance" char(2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profil_personne_physique"
        DROP COLUMN IF EXISTS "paysNaissance",
        DROP COLUMN IF EXISTS "nomNaissance",
        DROP COLUMN IF EXISTS "nom",
        DROP COLUMN IF EXISTS "prenom"
    `);
  }
}
