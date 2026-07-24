import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectRichFields1746316900000 implements MigrationInterface {
  name = 'AddProjectRichFields1746316900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('projet')) {
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "adresseComplete" varchar DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "latitude" decimal(10,7) DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "longitude" decimal(10,7) DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "youtubeUrl" varchar DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "nbFractions" integer DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "prixFraction" decimal(18,2) DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "previsionnel" jsonb DEFAULT NULL`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "chronologie" jsonb NOT NULL DEFAULT '[]'`);
      await queryRunner.query(`ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "garanties" jsonb NOT NULL DEFAULT '[]'`);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "avis" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projetId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "note" smallint NOT NULL,
        "commentaire" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_avis_note" CHECK ("note" >= 1 AND "note" <= 5),
        CONSTRAINT "PK_avis" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_avis_projetId" ON "avis" ("projetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_avis_userId" ON "avis" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "avis"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "garanties"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "chronologie"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "previsionnel"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "prixFraction"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "nbFractions"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "youtubeUrl"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "latitude"`);
    await queryRunner.query(`ALTER TABLE "projet" DROP COLUMN IF EXISTS "adresseComplete"`);
  }
}
