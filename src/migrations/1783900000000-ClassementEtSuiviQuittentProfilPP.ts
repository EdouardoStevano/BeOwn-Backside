import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le classement PSFP et la surveillance quittent `profil_personne_physique`.
 *
 * Six colonnes y vivaient sans lui appartenir. Elles se séparent en deux :
 *
 * 1. **Le classement** — `categoriePsfp`, `patrimoineDeclare`,
 *    `montantMaxConseille` — n'est pas stocké du tout. Il est *calculé* par le
 *    questionnaire d'adéquation (RG-KYC-13), et le profil n'en tenait qu'une
 *    copie, écrite par des `UPDATE` ciblés venus d'ailleurs.
 *    `InvestorComplianceProfile` le dérive à la demande de
 *    `questionnaire_adequation` : la copie disparaît, et avec elle le risque
 *    qu'elle diverge de sa source.
 * 2. **La surveillance** — `niveauRisque`, `dernierContactAdmin`,
 *    `prochainContactDu` — est, elle, un vrai état : une date de dernier
 *    contact ne se recalcule pas. Elle rejoint `dossier_investisseur`, qui
 *    devient de ce fait la table de la racine.
 *
 * **Ce que le déplacement corrige.** `profil_personne_physique` n'existe pas
 * pour une personne morale. Tant que le classement y vivait, une PM n'était
 * catégorisée nulle part — `subscription` lui opposait donc un plafond `null`,
 * c'est-à-dire aucun — et aucune surveillance périodique ne pouvait la viser.
 * Les deux tables d'arrivée sont clés sur le titulaire, quelle que soit sa
 * nature.
 *
 * Les valeurs de classement ne sont pas reprises : elles sont recalculables
 * depuis le questionnaire, et la copie était par construction la moins fiable
 * des deux.
 */
export class ClassementEtSuiviQuittentProfilPP1783900000000 implements MigrationInterface {
  name = 'ClassementEtSuiviQuittentProfilPP1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── La surveillance rejoint la racine ───────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "dossier_investisseur" ADD COLUMN IF NOT EXISTS "niveauRisque" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "dossier_investisseur" ADD COLUMN IF NOT EXISTS "dernierContactAdmin" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "dossier_investisseur" ADD COLUMN IF NOT EXISTS "prochainContactDu" TIMESTAMP WITH TIME ZONE`,
    );

    // Reprise depuis les profils physiques existants — les seuls qui en aient
    // jamais porté. `IS NULL` rend l'opération rejouable.
    await queryRunner.query(`
      UPDATE "dossier_investisseur" d
      SET "niveauRisque" = p."niveauRisque",
          "dernierContactAdmin" = p."dernierContactAdmin",
          "prochainContactDu" = p."prochainContactDu"
      FROM "profil_personne_physique" p
      WHERE p."userId" = d."userId"
        AND d."niveauRisque" IS NULL
        AND d."prochainContactDu" IS NULL
    `);

    // Le CRON quotidien balaie la table par cette colonne.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_dossier_prochain_contact" ON "dossier_investisseur" ("prochainContactDu")`,
    );

    // ── Le classement n'est plus stocké ─────────────────────────────────────
    for (const colonne of [
      'categoriePsfp',
      'patrimoineDeclare',
      'montantMaxConseille',
      'niveauRisque',
      'dernierContactAdmin',
      'prochainContactDu',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "profil_personne_physique" DROP COLUMN IF EXISTS "${colonne}"`,
      );
    }
  }

  /**
   * Retour arrière : les colonnes reviennent sur le profil physique, et la
   * surveillance y est recopiée.
   *
   * Le classement, lui, revient **vide**. Il n'est plus stocké nulle part, donc
   * il n'y a rien à recopier : `categoriePsfp` reprend son défaut
   * `non_averti`, et un passage de `SaveQuestionnaireUseCase` le
   * réalimenterait — c'était déjà son seul chemin d'écriture.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "categoriePsfp" character varying NOT NULL DEFAULT 'non_averti'`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "patrimoineDeclare" numeric(15,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "montantMaxConseille" numeric(15,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "niveauRisque" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "dernierContactAdmin" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "prochainContactDu" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(`
      UPDATE "profil_personne_physique" p
      SET "niveauRisque" = d."niveauRisque",
          "dernierContactAdmin" = d."dernierContactAdmin",
          "prochainContactDu" = d."prochainContactDu"
      FROM "dossier_investisseur" d
      WHERE d."userId" = p."userId"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_dossier_prochain_contact"`,
    );
    for (const colonne of [
      'niveauRisque',
      'dernierContactAdmin',
      'prochainContactDu',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "dossier_investisseur" DROP COLUMN IF EXISTS "${colonne}"`,
      );
    }
  }
}
