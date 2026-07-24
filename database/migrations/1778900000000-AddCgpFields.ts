import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCgpFields1778900000000 implements MigrationInterface {
  name = 'AddCgpFields1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cgpId" integer NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cgpReferralCode" varchar NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_cgpReferralCode" ON "users" ("cgpReferralCode") WHERE "cgpReferralCode" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_cgpReferralCode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "cgpReferralCode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "cgpId"`);
  }
}
