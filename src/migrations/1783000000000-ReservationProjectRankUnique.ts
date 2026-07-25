import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationProjectRankUnique1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reservation_project_rank" ON "reservation" ("projetId", "rangFile") WHERE "rangFile" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_reservation_project_rank"`,
    );
  }
}
