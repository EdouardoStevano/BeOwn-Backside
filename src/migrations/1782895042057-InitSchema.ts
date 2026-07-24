import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1782895042057 implements MigrationInterface {
    name = 'InitSchema1782895042057'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "loyer_encaisse" ALTER COLUMN "preuves" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "charge" ALTER COLUMN "justificatifs" SET DEFAULT '[]'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "charge" ALTER COLUMN "justificatifs" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "loyer_encaisse" ALTER COLUMN "preuves" SET DEFAULT '[]'`);
    }

}
