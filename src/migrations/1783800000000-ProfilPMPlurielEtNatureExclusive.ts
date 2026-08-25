import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un compte peut déclarer plusieurs sociétés — jamais une société **et** une
 * personne physique.
 *
 * Deux changements liés, qu'on ne peut pas séparer :
 *
 * 1. `profil_personne_morale` avait `utilisateurId` pour clé primaire, donc au
 *    plus une société par compte. Elle reçoit une identité propre, et le
 *    rattachement au compte devient une colonne ordinaire, indexée mais **non
 *    unique** — c'est toute la différence avec le dossier physique.
 * 2. Rien n'empêchait alors un compte de porter les deux. L'exclusivité passe
 *    par une table commune, `dossier_investisseur`, que les deux tables de
 *    profils référencent par clé étrangère **composée** `(userId, nature)` :
 *    un dossier moral sur un compte inscrit « PP » ne trouve aucune ligne à
 *    référencer, et l'insertion échoue. C'est la seule façon d'obtenir une
 *    garantie déclarative sur un invariant qui porte sur deux tables ; un
 *    trigger enfouirait la règle dans le schéma, où aucun test ne l'atteint.
 *
 * La colonne `nature` de chaque table de profils est figée par un `CHECK` et
 * remplie par son `DEFAULT` : le code applicatif ne l'écrit jamais, ne la lit
 * jamais, et n'a pas à savoir qu'elle existe. Elle n'est là que pour porter la
 * moitié constante de la clé étrangère composée.
 *
 * `beneficiaire_effectif.profilPMId` suit : il portait le `utilisateurId` du
 * titulaire, du temps où celui-ci tenait lieu de clé au dossier moral. Laissé
 * tel quel, il aurait confondu les bénéficiaires de toutes les sociétés d'un
 * même dirigeant.
 */
export class ProfilPMPlurielEtNatureExclusive1783800000000 implements MigrationInterface {
  name = 'ProfilPMPlurielEtNatureExclusive1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Le dossier moral reçoit une identité propre ──────────────────────
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'profil_personne_morale'
            AND column_name = 'utilisateurId'
        ) THEN
          ALTER TABLE "profil_personne_morale"
            RENAME COLUMN "utilisateurId" TO "userId";
        END IF;
      END $$;
    `);

    // Le nom de la clé primaire se lit dans le catalogue : plusieurs
    // `InitSchema` concurrents ont créé cette table sous des noms générés
    // différents, et un `DROP … IF EXISTS` sur le mauvais nom ne ferait rien.
    // On ajouterait alors une seconde clé primaire, ce que Postgres refuse.
    //
    // `beneficiaire_effectif` référence cette clé : sa contrainte doit tomber
    // d'abord, et elle sera reposée en 3 sur la nouvelle identité.
    await queryRunner.query(`
      DO $$
      DECLARE contrainte text;
      BEGIN
        FOR contrainte IN
          SELECT conname FROM pg_constraint
          WHERE confrelid = '"profil_personne_morale"'::regclass
            AND contype = 'f'
        LOOP
          EXECUTE format(
            'ALTER TABLE "beneficiaire_effectif" DROP CONSTRAINT %I',
            contrainte
          );
        END LOOP;

        SELECT conname INTO contrainte
        FROM pg_constraint
        WHERE conrelid = '"profil_personne_morale"'::regclass
          AND contype = 'p';

        IF contrainte IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "profil_personne_morale" DROP CONSTRAINT %I',
            contrainte
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" ADD CONSTRAINT "PK_profil_pm" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" ALTER COLUMN "userId" SET NOT NULL`,
    );
    // Indexé, pas unique : c'est ce qui autorise plusieurs sociétés.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_profil_pm_user" ON "profil_personne_morale" ("userId")`,
    );

    // ── 2. Les bénéficiaires suivent leur société ───────────────────────────
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD COLUMN IF NOT EXISTS "profilPMUuid" uuid`,
    );
    // Chaque compte n'ayant qu'une société à ce stade, la correspondance est
    // sans ambiguïté — c'est précisément ce que la migration s'apprête à
    // rendre faux pour la suite, d'où la reprise maintenant.
    await queryRunner.query(`
      UPDATE "beneficiaire_effectif" b
      SET "profilPMUuid" = p."id"
      FROM "profil_personne_morale" p
      WHERE p."userId" = b."profilPMId"
        AND b."profilPMUuid" IS NULL
    `);

    // Un bénéficiaire dont la société a disparu n'a plus de sens, et laisser
    // la ligne empêcherait de reposer la clé étrangère. On nomme le problème
    // plutôt que de le trancher à la place de l'exploitant.
    await queryRunner.query(`
      DO $$
      DECLARE orphelins bigint;
      BEGIN
        SELECT count(*) INTO orphelins
        FROM "beneficiaire_effectif"
        WHERE "profilPMUuid" IS NULL;

        IF orphelins > 0 THEN
          RAISE EXCEPTION
            '% bénéficiaire(s) effectif(s) ne se rattachent à aucune société. Supprimez-les ou rattachez-les avant de rejouer la migration.',
            orphelins;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP COLUMN IF EXISTS "profilPMId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" RENAME COLUMN "profilPMUuid" TO "profilPMId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ALTER COLUMN "profilPMId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beneficiaire_profil_pm" ON "beneficiaire_effectif" ("profilPMId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD CONSTRAINT "FK_beneficiaire_profil_pm" FOREIGN KEY ("profilPMId") REFERENCES "profil_personne_morale"("id") ON DELETE CASCADE`,
    );

    // ── 3. Le registre des natures, et l'exclusivité ────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossier_investisseur" (
        "userId" integer NOT NULL,
        "nature" character varying(2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dossier_investisseur" PRIMARY KEY ("userId"),
        CONSTRAINT "CHK_dossier_nature" CHECK ("nature" IN ('PP', 'PM')),
        CONSTRAINT "FK_dossier_investisseur_user" FOREIGN KEY ("userId") REFERENCES "users"("userId")
      )
    `);
    // Superclé — `userId` est déjà primaire — mais une clé étrangère composée
    // exige une contrainte d'unicité portant exactement sur ses deux colonnes.
    await queryRunner.query(
      `ALTER TABLE "dossier_investisseur" DROP CONSTRAINT IF EXISTS "UQ_dossier_user_nature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dossier_investisseur" ADD CONSTRAINT "UQ_dossier_user_nature" UNIQUE ("userId", "nature")`,
    );

    // Un compte portant déjà les deux rendrait la reprise impossible — et
    // c'est une donnée à arbitrer, pas à trancher par une migration.
    await queryRunner.query(`
      DO $$
      DECLARE ambigus bigint;
      BEGIN
        SELECT count(*) INTO ambigus
        FROM "profil_personne_physique" pp
        WHERE EXISTS (
          SELECT 1 FROM "profil_personne_morale" pm
          WHERE pm."userId" = pp."userId"
        );

        IF ambigus > 0 THEN
          RAISE EXCEPTION
            '% compte(s) portent à la fois un dossier personne physique et une société. Tranchez la nature de chacun avant de rejouer la migration.',
            ambigus;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO "dossier_investisseur" ("userId", "nature")
      SELECT "userId", 'PP' FROM "profil_personne_physique"
      UNION
      SELECT DISTINCT "userId", 'PM' FROM "profil_personne_morale"
      ON CONFLICT ("userId") DO NOTHING
    `);

    // La moitié constante de la clé composée. `CHECK` plutôt que colonne
    // générée : les colonnes générées ne peuvent pas entrer dans une clé
    // étrangère, et le résultat est le même — la valeur ne peut pas varier.
    for (const [table, nature] of [
      ['profil_personne_physique', 'PP'],
      ['profil_personne_morale', 'PM'],
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "nature" character varying(2) NOT NULL DEFAULT '${nature}'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "CHK_${table}_nature"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "CHK_${table}_nature" CHECK ("nature" = '${nature}')`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_nature"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_nature" FOREIGN KEY ("userId", "nature") REFERENCES "dossier_investisseur"("userId", "nature")`,
      );
    }
  }

  /**
   * Retour arrière.
   *
   * Les sociétés surnuméraires ne peuvent pas revenir : la table redevient
   * 1:1, et une clé primaire sur `userId` refuserait les doublons. On refuse
   * donc de descendre tant qu'un compte en porte plusieurs, plutôt que d'en
   * supprimer au hasard.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'profil_personne_physique',
      'profil_personne_morale',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_nature"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "CHK_${table}_nature"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "nature"`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "dossier_investisseur"`);

    await queryRunner.query(`
      DO $$
      DECLARE multiples bigint;
      BEGIN
        SELECT count(*) INTO multiples
        FROM (
          SELECT "userId" FROM "profil_personne_morale"
          GROUP BY "userId" HAVING count(*) > 1
        ) t;

        IF multiples > 0 THEN
          RAISE EXCEPTION
            '% compte(s) portent plusieurs sociétés : la table ne peut pas redevenir 1:1 sans en perdre. Arbitrez avant de redescendre.',
            multiples;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP CONSTRAINT IF EXISTS "FK_beneficiaire_profil_pm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD COLUMN IF NOT EXISTS "profilPMEntier" integer`,
    );
    await queryRunner.query(`
      UPDATE "beneficiaire_effectif" b
      SET "profilPMEntier" = p."userId"
      FROM "profil_personne_morale" p
      WHERE p."id" = b."profilPMId"
    `);
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" DROP COLUMN IF EXISTS "profilPMId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" RENAME COLUMN "profilPMEntier" TO "profilPMId"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_profil_pm_user"`);
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" DROP CONSTRAINT IF EXISTS "PK_profil_pm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" RENAME COLUMN "userId" TO "utilisateurId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" ADD CONSTRAINT "PK_profil_pm_utilisateur" PRIMARY KEY ("utilisateurId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_morale" DROP COLUMN IF EXISTS "id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "beneficiaire_effectif" ADD CONSTRAINT "FK_beneficiaire_profil_pm" FOREIGN KEY ("profilPMId") REFERENCES "profil_personne_morale"("utilisateurId") ON DELETE CASCADE`,
    );
  }
}
