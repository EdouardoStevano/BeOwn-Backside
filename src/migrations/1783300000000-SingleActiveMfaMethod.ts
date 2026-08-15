import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Impose l'invariant « au plus un facteur MFA actif par compte ».
 *
 * Jusqu'ici l'activation ne désactivait que son propre canal : un compte
 * protégé par TOTP qui enrôlait l'email se retrouvait avec **les deux** armés.
 * La connexion n'en opposait qu'un — le premier de l'ordre de préférence — et
 * l'autre restait un second chemin d'entrée, souvent plus faible, dont le
 * titulaire ignorait qu'il était ouvert.
 *
 * Le code applique désormais la règle à l'activation ; cet index la rend
 * **structurelle**, de sorte qu'aucun chemin d'écriture futur ne puisse la
 * contourner sans que Postgres le refuse.
 *
 * Reprise des comptes déjà en infraction : on conserve le facteur **enrôlé le
 * plus récemment** et on désactive les autres. Choisi contre l'alternative
 * « garder le plus fort » (TOTP > SMS > email) parce que l'échec à éviter en
 * priorité est la perte d'accès : le dernier facteur enrôlé est celui dont
 * l'utilisateur vient de prouver la possession, donc celui qu'il peut le plus
 * sûrement présenter. Un facteur plus fort reste réenrôlable à tout moment.
 *
 * Aucune ligne n'est supprimée : les facteurs désactivés restent en base, donc
 * la reprise est inspectable après coup.
 */
export class SingleActiveMfaMethod1783300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "mfa_methods"
      SET "isActive" = false
      WHERE "isActive" = true
        AND "id" NOT IN (
          SELECT MAX("id")
          FROM "mfa_methods"
          WHERE "isActive" = true AND "user_id" IS NOT NULL
          GROUP BY "user_id"
        )
        AND "user_id" IS NOT NULL
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mfa_methods_single_active" ON "mfa_methods" ("user_id") WHERE "isActive"`,
    );
  }

  /**
   * Seul l'index est retiré : les facteurs désactivés par la reprise ne sont
   * pas réactivés, faute de savoir lesquels l'étaient — et les réactiver en
   * masse rouvrirait précisément les chemins d'entrée que cette migration
   * ferme.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_mfa_methods_single_active"`,
    );
  }
}
