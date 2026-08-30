import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L'évaluation d'adéquation quitte `investor_compliance_profile` pour sa
 * propre table.
 *
 * **Deux agrégats ne partagent pas une ligne.** `InvestorComplianceProfile`
 * portait le dossier de vérification, le verdict KYB, le questionnaire, le
 * classement PSFP et la surveillance périodique. Il vient d'être scindé en deux
 * racines — l'une répond « ce souscripteur peut-il opérer », l'autre « jusqu'où
 * peut-il aller » — et deux racines écrivant la même ligne s'écrasent : celle
 * qui enregistre un questionnaire remettrait le KYB à la valeur qu'elle a lue,
 * et réciproquement.
 *
 * C'est aussi ce que la séparation en deux Bounded Contexts impose de toute
 * façon : une base partagée entre deux contextes est précisément ce que §3
 * proscrit.
 *
 * **Aucune clé ne bouge.** Les lignes d'évaluation reprennent **l'identifiant**
 * de la ligne de conformité dont elles sont issues : `questionnaire_adequation`
 * référençait `investor_compliance_profile.id`, il référence désormais
 * `evaluation_adequation.id` avec exactement les mêmes valeurs. La migration
 * repointe une contrainte, elle ne réécrit pas une colonne — ce qui la rend
 * réversible sans reprise de données.
 *
 * **Le classement n'est pas recalculé.** Il est copié tel quel : c'est un état
 * opposable, daté du jour où le questionnaire a été passé, et le recalculer
 * reviendrait à le redater silencieusement.
 */
export class EvaluationDAdequationATable1785100000000 implements MigrationInterface {
  name = 'EvaluationDAdequationATable1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "evaluation_adequation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" integer NOT NULL,
        "souscripteurSocieteId" uuid,
        "categoriePsfp" character varying NOT NULL DEFAULT 'non_averti',
        "patrimoineDeclare" numeric(15,2),
        "montantMaxConseille" numeric(15,2),
        "niveauRisque" character varying,
        "dernierContactAdmin" TIMESTAMP WITH TIME ZONE,
        "prochainContactDu" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_evaluation_adequation" PRIMARY KEY ("id")
      )
    `);

    // L'identifiant est **repris**, pas régénéré : c'est lui qui rend le
    // repointage du questionnaire gratuit.
    await queryRunner.query(`
      INSERT INTO "evaluation_adequation" (
        "id", "userId", "souscripteurSocieteId",
        "categoriePsfp", "patrimoineDeclare", "montantMaxConseille",
        "niveauRisque", "dernierContactAdmin", "prochainContactDu",
        "createdAt", "updatedAt"
      )
      SELECT
        "id", "userId", "souscripteurSocieteId",
        "categoriePsfp", "patrimoineDeclare", "montantMaxConseille",
        "niveauRisque", "dernierContactAdmin", "prochainContactDu",
        "createdAt", "updatedAt"
      FROM "investor_compliance_profile"
      ON CONFLICT ("id") DO NOTHING
    `);

    // Mêmes index partiels que la table d'origine : une contrainte à deux
    // colonnes ne suffirait pas, `NULL` n'étant jamais égal à `NULL`.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_eval_titulaire"
        ON "evaluation_adequation" ("userId")
        WHERE "souscripteurSocieteId" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_eval_societe"
        ON "evaluation_adequation" ("souscripteurSocieteId")
        WHERE "souscripteurSocieteId" IS NOT NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_eval_user" ON "evaluation_adequation" ("userId")`,
    );
    // Le CRON de surveillance balaie la table par cette colonne.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_eval_prochain_contact" ON "evaluation_adequation" ("prochainContactDu")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evaluation_adequation" ADD CONSTRAINT "FK_eval_societe" FOREIGN KEY ("souscripteurSocieteId") REFERENCES "profil_personne_morale"("id") ON DELETE CASCADE`,
    );

    // Le questionnaire suit son classement : même colonne, mêmes valeurs, autre
    // table référencée.
    await queryRunner.query(
      `ALTER TABLE "questionnaire_adequation" DROP CONSTRAINT IF EXISTS "FK_questionnaire_adequation_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questionnaire_adequation" ADD CONSTRAINT "FK_questionnaire_adequation_evaluation" FOREIGN KEY ("profileId") REFERENCES "evaluation_adequation"("id") ON DELETE CASCADE`,
    );

    // Ce que le dossier d'entrée en relation ne porte plus.
    for (const colonne of [
      'categoriePsfp',
      'patrimoineDeclare',
      'montantMaxConseille',
      'niveauRisque',
      'dernierContactAdmin',
      'prochainContactDu',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "investor_compliance_profile" DROP COLUMN IF EXISTS "${colonne}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les colonnes reviennent…
    await queryRunner.query(`
      ALTER TABLE "investor_compliance_profile"
        ADD COLUMN IF NOT EXISTS "categoriePsfp" character varying NOT NULL DEFAULT 'non_averti',
        ADD COLUMN IF NOT EXISTS "patrimoineDeclare" numeric(15,2),
        ADD COLUMN IF NOT EXISTS "montantMaxConseille" numeric(15,2),
        ADD COLUMN IF NOT EXISTS "niveauRisque" character varying,
        ADD COLUMN IF NOT EXISTS "dernierContactAdmin" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "prochainContactDu" TIMESTAMP WITH TIME ZONE
    `);

    // …avec leurs valeurs, que l'identité partagée rend faciles à retrouver.
    await queryRunner.query(`
      UPDATE "investor_compliance_profile" p
      SET "categoriePsfp" = e."categoriePsfp",
          "patrimoineDeclare" = e."patrimoineDeclare",
          "montantMaxConseille" = e."montantMaxConseille",
          "niveauRisque" = e."niveauRisque",
          "dernierContactAdmin" = e."dernierContactAdmin",
          "prochainContactDu" = e."prochainContactDu"
      FROM "evaluation_adequation" e
      WHERE e."id" = p."id"
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_icp_prochain_contact" ON "investor_compliance_profile" ("prochainContactDu")`,
    );

    await queryRunner.query(
      `ALTER TABLE "questionnaire_adequation" DROP CONSTRAINT IF EXISTS "FK_questionnaire_adequation_evaluation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questionnaire_adequation" ADD CONSTRAINT "FK_questionnaire_adequation_profile" FOREIGN KEY ("profileId") REFERENCES "investor_compliance_profile"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "evaluation_adequation"`);
  }
}
