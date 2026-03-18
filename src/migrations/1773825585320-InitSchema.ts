import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1773825585320 implements MigrationInterface {
    name = 'InitSchema1773825585320'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "isEmailVerify" boolean NOT NULL DEFAULT false, "firstname" character varying, "lastname" character varying, "socialId" character varying, "password" character varying, "isTfaEnabled" boolean NOT NULL DEFAULT false, "tfaSecret" character varying, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2025eaefc4e1b443c84f6ca9b2" ON "users" ("socialId") `);
        await queryRunner.query(`CREATE INDEX "IDX_2025eaefc4e1b443c84f6ca9b2" ON "users" ("socialId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_2025eaefc4e1b443c84f6ca9b2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2025eaefc4e1b443c84f6ca9b2"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
