import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un compte porte un dossier personne physique **et** ses sociétés.
 *
 * `ProfilPMPlurielEtNatureExclusive1783800000000` avait posé l'inverse : une
 * clé étrangère composée `(userId, nature)` depuis chacune des deux tables de
 * profils vers `dossier_investisseur`, de sorte qu'un compte inscrit « PP » ne
 * puisse pas déclarer de société. C'était une lecture erronée du cahier des
 * charges, qui dit exactement le contraire :
 *
 * > Chaque compte utilisateur peut disposer d'un seul profil « Personne
 * > Physique » **et** d'une infinité de profils « Personne Morale ». Cela
 * > permet ainsi à l'utilisateur qui le souhaite d'investir via les entreprises
 * > dont il est le représentant légal sans avoir besoin de se créer plusieurs
 * > comptes ni de compléter les informations redondantes.
 *
 * Le connecteur est « et ». Le profil personne physique n'est pas une manière
 * d'investir qui en exclurait une autre : c'est **le dossier d'identité de la
 * personne derrière le compte**, celle-là même qui représente légalement chaque
 * société déclarée. Les « informations redondantes » que le cahier des charges
 * dit éviter sont précisément celles-là — saisies une fois, elles valent pour
 * toutes les sociétés. L'exclusivité les rendait inaccessibles à un compte
 * moral, qui n'avait alors ni adresse, ni date de naissance, ni nationalité.
 *
 * Ce qui tombe :
 *
 * - les deux clés étrangères composées, et les `CHECK` qui en figeaient la
 *   moitié constante ;
 * - la colonne `nature` des deux tables de profils, qui n'existait que pour les
 *   porter — le code applicatif ne l'a jamais lue ni écrite ;
 * - la colonne `nature` de `investor_compliance_profile`, devenue indécidable :
 *   un compte relève désormais des deux régimes à la fois. Ce qu'elle prétendait
 *   dire se lit sans elle, et sans ambiguïté — un dossier physique existe ou
 *   non, des sociétés sont déclarées ou non.
 *
 * Ce qui reste : l'unicité du dossier physique (`profil_personne_physique.userId`
 * est `UNIQUE`) et la pluralité des sociétés (`profil_personne_morale.userId`
 * est indexée sans l'être). Ce sont les deux cardinalités que la phrase énonce,
 * et elles étaient déjà justes.
 *
 * **Aucune donnée n'est perdue ni réécrite.** Les colonnes supprimées sont
 * dérivées ou constantes : `nature` valait `'PP'` sur toutes les lignes de la
 * table physique, `'PM'` sur toutes celles de la table morale, et la nature du
 * dossier de conformité se recalcule depuis les deux — c'est ce que fait le
 * retour arrière.
 */
export class ProfilsPPEtPMCoexistent1784100000000 implements MigrationInterface {
  name = 'ProfilsPPEtPMCoexistent1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. L'exclusivité quitte les tables de profils ───────────────────────
    //
    // Dans cet ordre : la clé étrangère référence l'unicité composée qu'on
    // supprime ensuite, et le `CHECK` porte sur la colonne qu'on supprime après.
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

    // ── 2. Le dossier de conformité cesse d'avoir une nature ────────────────
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP CONSTRAINT IF EXISTS "UQ_dossier_user_nature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" DROP COLUMN IF EXISTS "nature"`,
    );
  }

  /**
   * Retour arrière : l'exclusivité redevient opposable.
   *
   * Elle ne peut pas l'être rétroactivement. Un compte qui aura profité de la
   * coexistence — un dossier physique et au moins une société — n'a pas de
   * nature unique à retrouver, et en choisir une à sa place supprimerait des
   * dossiers réglementaires. On refuse de descendre en le nommant, comme le
   * faisait déjà la migration qui a posé l'exclusivité pour le cas symétrique.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
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
            '% compte(s) portent à la fois un dossier personne physique et une société. L''exclusivité ne peut pas être rétablie sans arbitrer chacun.',
            ambigus;
        END IF;
      END $$;
    `);

    // La nature se recalcule depuis les profils, seule source qui la porte
    // encore : un dossier physique fait un compte « PP », une société un compte
    // « PM », et l'absence des deux laisse la nature vide — un titulaire peut
    // avoir commencé sa vérification d'identité sans avoir rien déclaré.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD COLUMN IF NOT EXISTS "nature" character varying(2)`,
    );
    await queryRunner.query(`
      UPDATE "investor_compliance_profile" p
      SET "nature" = 'PP'
      WHERE EXISTS (
        SELECT 1 FROM "profil_personne_physique" pp WHERE pp."userId" = p."userId"
      )
    `);
    await queryRunner.query(`
      UPDATE "investor_compliance_profile" p
      SET "nature" = 'PM'
      WHERE "nature" IS NULL
        AND EXISTS (
          SELECT 1 FROM "profil_personne_morale" pm WHERE pm."userId" = p."userId"
        )
    `);

    // Un profil dont le compte n'a pas encore de dossier de conformité n'aurait
    // aucune ligne à référencer : la clé étrangère composée échouerait.
    await queryRunner.query(`
      INSERT INTO "investor_compliance_profile" ("userId", "nature")
      SELECT "userId", 'PP' FROM "profil_personne_physique"
      UNION
      SELECT DISTINCT "userId", 'PM' FROM "profil_personne_morale"
      ON CONFLICT ("userId") DO NOTHING
    `);

    // Superclé — `userId` est déjà unique — mais une clé étrangère composée
    // exige une contrainte d'unicité portant exactement sur ses deux colonnes.
    await queryRunner.query(
      `ALTER TABLE "investor_compliance_profile" ADD CONSTRAINT "UQ_dossier_user_nature" UNIQUE ("userId", "nature")`,
    );

    for (const [table, nature] of [
      ['profil_personne_physique', 'PP'],
      ['profil_personne_morale', 'PM'],
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "nature" character varying(2) NOT NULL DEFAULT '${nature}'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "CHK_${table}_nature" CHECK ("nature" = '${nature}')`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_nature" FOREIGN KEY ("userId", "nature") REFERENCES "investor_compliance_profile"("userId", "nature")`,
      );
    }
  }
}
