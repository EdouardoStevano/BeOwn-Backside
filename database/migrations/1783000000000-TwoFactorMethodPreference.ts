import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La 2FA passe d'un booléen à un choix de canal.
 *
 * `twoFactorEnabled` ne pouvait pas dire *par quel* canal challenger
 * l'utilisateur — email, SMS ou TOTP. On le remplace par `twoFactorMethod`,
 * nullable : NULL vaut « pas de 2FA », et une valeur vaut à la fois « activée »
 * et « par ce canal-là ».
 *
 * Aucune reprise de données à faire : un compte qui avait twoFactorEnabled=true
 * n'avait de toute façon aucun canal confirmé (rien n'écrivait dans
 * tfa_methods), il ne pouvait donc pas recevoir de code. Le repasser à NULL le
 * laisse se connecter, et il pourra enrôler un vrai canal via /auth/2fa/enroll.
 */
export class TwoFactorMethodPreference1783000000000 implements MigrationInterface {
  name = 'TwoFactorMethodPreference1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "twoFactorMethod" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      DROP COLUMN IF EXISTS "twoFactorEnabled"
    `);

    // La colonne existait déjà mais restait nullable : plus personne n'écrit de
    // méthode 2FA sans propriétaire, et le repository l'exige désormais.
    await queryRunner.query(
      `DELETE FROM "tfa_methods" WHERE "user_id" IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "tfa_methods"
      ALTER COLUMN "user_id" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tfa_methods"
      ALTER COLUMN "user_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "user_preferences"
      SET "twoFactorEnabled" = true
      WHERE "twoFactorMethod" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "user_preferences"
      DROP COLUMN IF EXISTS "twoFactorMethod"
    `);
  }
}
