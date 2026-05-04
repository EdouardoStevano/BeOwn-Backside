import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentImageFields1746316800000 implements MigrationInterface {
  name = 'AddDocumentImageFields1746316800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "ordre" integer DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "estPrincipale" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "document" DROP COLUMN IF EXISTS "estPrincipale"`);
    await queryRunner.query(`ALTER TABLE "document" DROP COLUMN IF EXISTS "ordre"`);
  }
}
