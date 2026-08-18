import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `prenom`, `nom` et `telephone` quittent `profil_pp` pour `user`.
 *
 * Les deux premiers y étaient **recopiés du compte** à la création du dossier
 * et jamais modifiables depuis le formulaire : deux vérités sur la même
 * personne, dont une seule bougeait quand le titulaire se renommait. Le
 * troisième n'existait que sur le dossier, si bien qu'un compte sans profil
 * était injoignable par SMS et qu'une suppression de dossier aurait effacé le
 * numéro.
 *
 * L'ordre compte : on ajoute la colonne, on **reprend** les numéros existants,
 * et seulement ensuite on retire les colonnes du dossier. Interrompue entre
 * deux étapes, la migration laisse une base lisible par l'ancien comme par le
 * nouveau code.
 */
export class MoveIdentityToUser1783400000000 implements MigrationInterface {
  name = 'MoveIdentityToUser1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "telephone" character varying`,
    );

    // Reprise des numéros déjà déclarés. `WHERE user.telephone IS NULL` rend
    // l'opération rejouable : relancée, elle n'écrase pas un numéro saisi
    // depuis sur le compte.
    await queryRunner.query(`
      UPDATE "user" u
      SET "telephone" = p."telephone"
      FROM "profil_pp" p
      WHERE p."utilisateurId" = u."userId"
        AND p."telephone" IS NOT NULL
        AND u."telephone" IS NULL
    `);

    // Le prénom et le nom du dossier ne sont pas repris : le compte est leur
    // source, le dossier n'en tenait qu'une copie — y compris le marqueur « — »
    // écrit pour les comptes sans état civil. La recopier écraserait le compte
    // par sa propre ombre.
    await queryRunner.query(
      `ALTER TABLE "profil_pp" DROP COLUMN IF EXISTS "prenom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_pp" DROP COLUMN IF EXISTS "nom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_pp" DROP COLUMN IF EXISTS "telephone"`,
    );
  }

  /**
   * Retour arrière : les colonnes reviennent et sont réalimentées depuis le
   * compte.
   *
   * `prenom` et `nom` étaient `NOT NULL`. On les recrée nullables, on les
   * remplit, puis on repose la contrainte — un compte sans état civil reçoit le
   * marqueur que le domaine écrivait alors, faute de quoi la contrainte
   * échouerait sur les dossiers concernés.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_pp" ADD COLUMN IF NOT EXISTS "prenom" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_pp" ADD COLUMN IF NOT EXISTS "nom" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_pp" ADD COLUMN IF NOT EXISTS "telephone" character varying`,
    );

    await queryRunner.query(`
      UPDATE "profil_pp" p
      SET "prenom" = COALESCE(NULLIF(u."firstname", ''), '—'),
          "nom" = COALESCE(NULLIF(u."lastname", ''), '—'),
          "telephone" = u."telephone"
      FROM "user" u
      WHERE p."utilisateurId" = u."userId"
    `);
    // Dossiers dont le compte a disparu : la contrainte doit tout de même tenir.
    await queryRunner.query(
      `UPDATE "profil_pp" SET "prenom" = '—' WHERE "prenom" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "profil_pp" SET "nom" = '—' WHERE "nom" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "profil_pp" ALTER COLUMN "prenom" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_pp" ALTER COLUMN "nom" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "telephone"`,
    );
  }
}
