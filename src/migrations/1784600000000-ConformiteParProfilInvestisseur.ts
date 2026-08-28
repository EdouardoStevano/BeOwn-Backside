import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le dossier de conformité est clé sur le **profil investisseur**, plus sur le
 * compte.
 *
 * Le classement PSFP s'apprécie sur l'investisseur, et un compte en porte
 * plusieurs depuis qu'il déclare ses sociétés : une SAS peut être
 * professionnelle quand son dirigeant est non-averti. Lui opposer le classement
 * de son représentant lui imposerait un plafond conseillé et un délai de
 * rétractation qui ne la concernent pas — et, dans l'autre sens, dispenserait
 * un dirigeant non-averti du régime protecteur dès que sa société serait
 * classée professionnelle.
 *
 * **Une ligne par profil** : celle du titulaire (`souscripteurSocieteId` nul),
 * et une par société dont le questionnaire a été passé. Les lignes existantes
 * sont toutes des lignes de titulaire, et le restent — aucune reprise de
 * données, aucun classement déplacé.
 *
 * **Le KYC ne bouge pas.** Il reste rattaché à la ligne du titulaire, par
 * `kyc.profileId`. Une société n'a pas d'identité à vérifier : elle a un KYB —
 * `piece_justificative` — et un représentant dont la vérification vaut pour
 * toutes ses sociétés, ce qui est exactement l'économie que le cahier des
 * charges vise en refusant « les informations redondantes ».
 *
 * **L'unicité passe à deux index partiels.** `UQ_icp_user` interdisait plus
 * d'une ligne par compte ; il tombe. Une contrainte à deux colonnes ne le
 * remplacerait pas : `NULL` n'est jamais égal à `NULL` dans un index unique
 * Postgres, donc elle laisserait passer autant de lignes de titulaire qu'on
 * veut. D'où un index par cas — un dossier par compte en nom propre, un
 * dossier par société.
 */
export class ConformiteParProfilInvestisseur1784600000000 implements MigrationInterface {
  name = 'ConformiteParProfilInvestisseur1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "souscripteurSocieteId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "FK_icp_societe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "FK_icp_societe" FOREIGN KEY ("souscripteurSocieteId") REFERENCES "profil_personne_morale"("id") ON DELETE CASCADE`,
    );

    // L'unicité par compte tombe : elle interdisait le second profil.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "UQ_icp_user"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_icp_user"`);

    // Un dossier en nom propre par compte…
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_icp_titulaire"
        ON "investor_compliance_profile" ("userId")
        WHERE "souscripteurSocieteId" IS NULL
    `);
    // …et un dossier par société, quel que soit le compte qui la déclare.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_icp_societe"
        ON "investor_compliance_profile" ("souscripteurSocieteId")
        WHERE "souscripteurSocieteId" IS NOT NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_icp_user" ON "investor_compliance_profile" ("userId")`,
    );
  }

  /**
   * Retour arrière : le compte redevient la clé.
   *
   * Les dossiers de sociétés ne peuvent pas y survivre — l'unicité par compte
   * les refuserait, et les fondre dans celui du titulaire lui attribuerait un
   * classement qu'il n'a pas passé. On refuse de descendre en les nommant,
   * plutôt que d'en supprimer au hasard ou d'en écraser un.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE societes bigint;
      BEGIN
        SELECT count(*) INTO societes
        FROM "investor_compliance_profile"
        WHERE "souscripteurSocieteId" IS NOT NULL;

        IF societes > 0 THEN
          RAISE EXCEPTION
            '% dossier(s) de conformité appartiennent à des sociétés. Le compte ne peut pas redevenir la clé sans leur attribuer un classement qu''elles n''ont pas passé.',
            societes;
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_icp_titulaire"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_icp_societe"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_icp_user"`);
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "FK_icp_societe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP COLUMN IF EXISTS "souscripteurSocieteId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "UQ_icp_user" UNIQUE ("userId")`,
    );
  }
}
