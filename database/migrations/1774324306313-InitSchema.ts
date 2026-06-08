import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1774324306313 implements MigrationInterface {
  name = 'InitSchema1774324306313';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_emails" ("userId" SERIAL NOT NULL, "email" character varying NOT NULL, "isVerified" boolean NOT NULL DEFAULT false, "verifiedDate" TIMESTAMP, "user_id" integer, CONSTRAINT "REL_2e88b95787b903d46ab3cc3eb9" UNIQUE ("user_id"), CONSTRAINT "PK_569342223a28f006d9bf897c7c9" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "tfa_methods" ("TFAMethodId" SERIAL NOT NULL, "isActive" boolean NOT NULL, "activatedDate" TIMESTAMP NOT NULL DEFAULT now(), "secretKeyOtp" character varying, "phoneNumberOTP" character varying, "emailOTP" character varying, "type_method" character varying NOT NULL, "user_id" integer, CONSTRAINT "UQ_eb3417033e99e3f89ece05d4f67" UNIQUE ("emailOTP"), CONSTRAINT "PK_cfb2cd00764ac509b752337f41d" PRIMARY KEY ("TFAMethodId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bf1c9c94568f6e26329581efa1" ON "tfa_methods" ("type_method") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("userId" SERIAL NOT NULL, "firstname" character varying, "lastname" character varying, "socialId" character varying, "password" character varying, CONSTRAINT "PK_8bf09ba754322ab9c22a215c919" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_2025eaefc4e1b443c84f6ca9b2" ON "users" ("socialId") `,
    );
    await queryRunner.query(
      `DO $$ BEGIN ALTER TABLE "user_emails" ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91" FOREIGN KEY ("user_id") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN ALTER TABLE "tfa_methods" ADD CONSTRAINT "FK_bb0f7b313bc22dcbd060c97d8d4" FOREIGN KEY ("user_id") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tfa_methods" DROP CONSTRAINT "FK_bb0f7b313bc22dcbd060c97d8d4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_emails" DROP CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2025eaefc4e1b443c84f6ca9b2"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bf1c9c94568f6e26329581efa1"`,
    );
    await queryRunner.query(`DROP TABLE "tfa_methods"`);
    await queryRunner.query(`DROP TABLE "user_emails"`);
  }
}
