import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndiceRisqueToProjet1779100000000 implements MigrationInterface {
  name = 'AddIndiceRisqueToProjet1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "indiceRisque" integer NOT NULL DEFAULT 3`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projet" DROP COLUMN IF EXISTS "indiceRisque"`,
    );
  }
}
