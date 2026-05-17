import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFiscalFieldsToEcheance1747528000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN "prelevementIR" decimal(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN "prelevementCSG" decimal(14,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN "prelevementCSG"`);
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN "prelevementIR"`);
  }
}
