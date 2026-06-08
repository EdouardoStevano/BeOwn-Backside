import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPsfpFieldsToProfilPP1747524600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "patrimoineDeclare" numeric(15,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "montantMaxConseille" numeric(15,2) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP COLUMN "montantMaxConseille"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP COLUMN "patrimoineDeclare"`,
    );
  }
}
