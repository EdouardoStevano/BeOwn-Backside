import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendEcheanceStatusAndAddChangeTimestamp1779000000001
  implements MigrationInterface
{
  name = 'ExtendEcheanceStatusAndAddChangeTimestamp1779000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Migrate legacy "retard" rows to "retard_leger" (cron will re-classify next run)
    await queryRunner.query(
      `UPDATE "echeance" SET "statut" = 'retard_leger' WHERE "statut" = 'retard'`,
    );

    // 2. Add timestamp column to detect status transitions
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN IF NOT EXISTS "statutChangeLe" timestamptz NULL`,
    );

    // 3. Helpful indexes for cron filtering
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_echeance_statut" ON "echeance" ("statut")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_echeance_datePrevue_statut" ON "echeance" ("datePrevue", "statut")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_echeance_datePrevue_statut"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_echeance_statut"`);
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN IF EXISTS "statutChangeLe"`);
    await queryRunner.query(
      `UPDATE "echeance" SET "statut" = 'retard'
        WHERE "statut" IN ('retard_leger', 'retard_significatif', 'defaut', 'perte_definitive')`,
    );
  }
}
