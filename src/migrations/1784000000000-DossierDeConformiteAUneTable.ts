import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le dossier de conformité devient une table, et ses deux pièces s'y rattachent.
 *
 * `dossier_investisseur` — créée pour porter l'exclusivité PP ⊻ PM, puis la
 * surveillance périodique — devient `investor_compliance_profile`, la table de
 * la racine `InvestorComplianceProfile`. Elle gagne une identité propre, le
 * classement PSFP, et trois relations 1:1 :
 *
 * | Vers                       | Portée par                        |
 * | -------------------------- | --------------------------------- |
 * | `users`                    | `userId`, unique et non nul       |
 * | `kyc`                      | `kyc.profileId`, unique           |
 * | `questionnaire_adequation` | `questionnaire.profileId`, unique |
 *
 * **Ce que ça referme.** `kyc` et `questionnaire_adequation` portaient chacune
 * un `utilisateurId` vers `users` : deux entités internes se rattachaient au
 * titulaire par-dessus leur racine, si bien qu'on pouvait lire ou écrire un
 * dossier de vérification sans jamais passer par le dossier de conformité qui
 * le contient (§6). Seule la racine connaît désormais le compte.
 *
 * **Une ligne racine est créée pour chaque titulaire qui a déjà une pièce**, y
 * compris ceux qui n'ont ni profil PP ni profil PM — un compte peut avoir
 * commencé sa vérification d'identité sans avoir choisi sa nature. `nature`
 * devient donc nullable ; la clé étrangère composée qui porte l'exclusivité
 * n'en souffre pas, une ligne sans nature ne pouvant être référencée par aucun
 * profil.
 */
export class DossierDeConformiteAUneTable1784000000000 implements MigrationInterface {
  name = 'DossierDeConformiteAUneTable1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. La table de la racine ────────────────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'dossier_investisseur'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'investor_compliance_profile'
        ) THEN
          ALTER TABLE "dossier_investisseur"
            RENAME TO "investor_compliance_profile";
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "categoriePsfp" character varying NOT NULL DEFAULT 'non_averti'`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "patrimoineDeclare" numeric(15,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "montantMaxConseille" numeric(15,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    // Le classement est repris du questionnaire, qui en est la source.
    await queryRunner.query(`
      UPDATE "investor_compliance_profile" p
      SET "categoriePsfp" = COALESCE(q."resultCategorie", 'non_averti'),
          "patrimoineDeclare" = q."patrimoineNet",
          "montantMaxConseille" = q."resultMontantMaxConseille"
      FROM "questionnaire_adequation" q
      WHERE q."utilisateurId" = p."userId"
    `);

    // `nature` devient facultative : un dossier peut naître d'une vérification
    // d'identité, avant tout choix de nature.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ALTER COLUMN "nature" DROP NOT NULL`,
    );

    // ── 2. Une racine pour chaque titulaire qui a déjà une pièce ────────────
    await queryRunner.query(`
      INSERT INTO "investor_compliance_profile" ("userId")
      SELECT DISTINCT "utilisateurId" FROM "kyc"
      UNION
      SELECT DISTINCT "utilisateurId" FROM "questionnaire_adequation"
      ON CONFLICT ("userId") DO NOTHING
    `);

    // ── 3. La clé primaire déménage sur l'identité propre ───────────────────
    await queryRunner.query(`
      DO $$
      DECLARE contrainte text;
      BEGIN
        SELECT conname INTO contrainte
        FROM pg_constraint
        WHERE conrelid = '"investor_compliance_profile"'::regclass
          AND contype = 'p';

        IF contrainte IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT %I',
            contrainte
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "PK_investor_compliance_profile" PRIMARY KEY ("id")`,
    );
    // `userId` reste unique : c'est la relation 1:1 avec le compte.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "UQ_icp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "UQ_icp_user" UNIQUE ("userId")`,
    );

    // ── 4. Les deux pièces se rattachent à la racine ────────────────────────
    for (const table of ['kyc', 'questionnaire_adequation']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "profileId" uuid`,
      );
      await queryRunner.query(`
        UPDATE "${table}" t
        SET "profileId" = p."id"
        FROM "investor_compliance_profile" p
        WHERE p."userId" = t."utilisateurId"
          AND t."profileId" IS NULL
      `);

      // Une pièce sans racine est impossible après l'étape 2 : si le compte a
      // disparu entre-temps, la ligne est orpheline et doit être arbitrée.
      await queryRunner.query(`
        DO $$
        DECLARE orphelines bigint;
        BEGIN
          SELECT count(*) INTO orphelines
          FROM "${table}" WHERE "profileId" IS NULL;

          IF orphelines > 0 THEN
            RAISE EXCEPTION
              '% ligne(s) de ${table} ne se rattachent à aucun dossier de conformité. Supprimez-les avant de rejouer la migration.',
              orphelines;
          END IF;
        END $$;
      `);

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "profileId" SET NOT NULL`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_profile"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_${table}_profile" ON "${table}" ("profileId")`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_profile"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_profile" FOREIGN KEY ("profileId") REFERENCES "investor_compliance_profile"("id") ON DELETE CASCADE`,
      );

      // Le lien direct au compte disparaît, avec la clé étrangère qui le
      // portait — c'est tout l'objet de cette migration.
      await queryRunner.query(`
        DO $$
        DECLARE contrainte text;
        BEGIN
          FOR contrainte IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = '"${table}"'::regclass AND contype = 'f'
              AND confrelid = '"users"'::regclass
          LOOP
            EXECUTE format(
              'ALTER TABLE "${table}" DROP CONSTRAINT %I', contrainte
            );
          END LOOP;
        END $$;
      `);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "utilisateurId"`,
      );
    }
  }

  /**
   * Retour arrière : chaque pièce retrouve son `utilisateurId`, et la racine
   * redevient `dossier_investisseur`.
   *
   * Le classement n'est pas remis sur `profil_personne_physique` : il n'y était
   * déjà plus avant cette migration (voir `ClassementEtSuiviQuittentProfilPP`).
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['kyc', 'questionnaire_adequation']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "utilisateurId" integer`,
      );
      await queryRunner.query(`
        UPDATE "${table}" t
        SET "utilisateurId" = p."userId"
        FROM "investor_compliance_profile" p
        WHERE p."id" = t."profileId"
      `);
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "utilisateurId" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_profile"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_profile"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "profileId"`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "UQ_icp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "PK_investor_compliance_profile"`,
    );
    // Les lignes sans nature n'existaient pas avant : elles viennent des
    // titulaires qui n'ont qu'une vérification d'identité.
    await queryRunner.query(
      `DELETE FROM "investor_compliance_profile" WHERE "nature" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ALTER COLUMN "nature" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "PK_dossier_investisseur" PRIMARY KEY ("userId")`,
    );
    for (const colonne of [
      'id',
      'categoriePsfp',
      'patrimoineDeclare',
      'montantMaxConseille',
      'updatedAt',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "investor_compliance_profile" DROP COLUMN IF EXISTS "${colonne}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" RENAME TO "dossier_investisseur"`,
    );
  }
}
