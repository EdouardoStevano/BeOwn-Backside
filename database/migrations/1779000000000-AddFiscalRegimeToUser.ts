import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFiscalRegimeToUser1779000000000 implements MigrationInterface {
  name = 'AddFiscalRegimeToUser1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "regimeFiscal" varchar NOT NULL DEFAULT 'PFU'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tauxBaremeMarginal" decimal(4,3) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tauxBaremeMarginal"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "regimeFiscal"`);
  }
}
