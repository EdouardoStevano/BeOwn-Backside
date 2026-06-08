import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEcheanceReminderFlags1778831051000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('echeance'))) return;
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN IF NOT EXISTS "rappelJ7Envoye" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "echeance" ADD COLUMN IF NOT EXISTS "rappelJ1Envoye" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN "rappelJ1Envoye"`);
    await queryRunner.query(`ALTER TABLE "echeance" DROP COLUMN "rappelJ7Envoye"`);
  }
}
