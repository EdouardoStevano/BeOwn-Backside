import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La fiche projet gagne ses blocs de contenu, et récupère ses photos.
 *
 * **Trois colonnes sur `projet`** :
 *
 * - `descriptionCourte` — l'accroche. Elle manquait : le catalogue et les cartes
 *   de partage tronquaient le markdown de `descriptionMd` au caractère près ;
 * - `blocsDeContenu` — les pavés éditoriaux, « autant que l'administrateur le
 *   souhaite », chacun avec son titre, son rang et son texte enrichi ;
 * - `photos` — la galerie.
 *
 * **En `jsonb` plutôt qu'en tables filles**, comme `garanties` et `chronologie`
 * avant elles : ce sont des entités *internes* à l'agrégat projet, qui ne se
 * chargent ni ne se cherchent jamais seules, et dont les invariants portent sur
 * la suite entière (§6.1). Les garder dans la ligne du projet fait de leur
 * écriture la même transaction que celle de l'agrégat (§17).
 *
 * **La reprise des photos est le cœur de cette migration.** Les images de fiche
 * étaient des `document` de type `PHOTO_PROJET` — donc des `SignableDocument`,
 * dans un contexte dont le nom dit qu'il existe pour les pièces qui *engagent
 * juridiquement celui qui les signe*. Une photo de façade ne se signe pas.
 * Elles deviennent des `PhotoProjet`, entités de l'agrégat `Project`.
 *
 * Ce déplacement corrige un invariant que rien ne tenait : « une seule vignette
 * par projet ». Aucun document ne pouvait le savoir seul, et le repository le
 * rattrapait par deux `UPDATE` successifs. Dans le nouveau modèle il n'y a plus
 * d'invariant à tenir : **la vignette est la photo de rang 0**.
 *
 * La migration produit donc directement cette forme canonique. `DISTINCT ON
 * (projectId)` élit une vignette par projet — celle qui était marquée, à défaut
 * la première par `ordre` — puis le `ROW_NUMBER` la classe en tête, si bien que
 * `position = 0` et `estPrincipale = true` désignent toujours la même ligne. Les
 * projets qui en comptaient zéro ou plusieurs sortent d'ici avec exactement une,
 * et les projets sans photo avec `[]`.
 *
 * `document.ordre` et `document.estPrincipale` partent avec elles : elles
 * valaient `null` et `false` sur toutes les autres lignes.
 *
 * Réversible : `down` réécrit les lignes `document` depuis le `jsonb`, avec
 * leurs identifiants d'origine — ils sont **repris**, jamais régénérés, ce qui
 * est ce qui rend l'aller-retour gratuit.
 */
export class ContenuEditorialDuProjet1785200000000
  implements MigrationInterface
{
  name = 'ContenuEditorialDuProjet1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projet"
        ADD COLUMN IF NOT EXISTS "descriptionCourte" character varying(500),
        ADD COLUMN IF NOT EXISTS "blocsDeContenu" jsonb DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "photos" jsonb DEFAULT '[]'::jsonb
    `);

    // Trois CTE, et le découpage n'est pas cosmétique : Postgres refuse un appel
    // de fonction fenêtre à l'intérieur d'un agrégat (« aggregate function calls
    // cannot contain window function calls », SQLSTATE 42803). Le rang doit donc
    // être **calculé** dans `rangee` avant d'être **agrégé** dans `galerie` — un
    // `ROW_NUMBER()` posé directement dans le `jsonb_build_object` du
    // `jsonb_agg` ne s'exécute pas.
    //
    // 1. `vignette` élit une photo par projet : celle qui était marquée
    //    principale, à défaut la première par `ordre` puis par ancienneté. C'est
    //    ce `DISTINCT ON` qui garantit qu'aucun projet n'en ressort avec deux —
    //    ce que la table `document` n'empêchait pas.
    // 2. `rangee` classe les photos, l'élue en tête, et numérote à partir de 0.
    // 3. `galerie` assemble le `jsonb`, dans ce même ordre.
    await queryRunner.query(`
      WITH "vignette" AS (
        SELECT DISTINCT ON ("projectId") "projectId", "id"
        FROM "document"
        WHERE "type" = 'PHOTO_PROJET' AND "projectId" IS NOT NULL
        ORDER BY
          "projectId",
          "estPrincipale" DESC,
          "ordre" ASC NULLS LAST,
          "createdAt" ASC
      ),
      "rangee" AS (
        SELECT
          d."id",
          d."projectId",
          d."path",
          d."filename",
          d."originalName",
          d."mimeType",
          d."sizeBytes",
          d."uploadedBy",
          d."createdAt",
          (v."id" IS NOT NULL) AS "estVignette",
          ROW_NUMBER() OVER (
            PARTITION BY d."projectId"
            ORDER BY
              (v."id" IS NOT NULL) DESC,
              d."ordre" ASC NULLS LAST,
              d."createdAt" ASC
          ) - 1 AS "rang"
        FROM "document" d
        LEFT JOIN "vignette" v
          ON v."id" = d."id"
        WHERE d."type" = 'PHOTO_PROJET' AND d."projectId" IS NOT NULL
      ),
      "galerie" AS (
        SELECT
          r."projectId",
          jsonb_agg(
            jsonb_build_object(
              'id',              r."id",
              'url',             r."path",
              'cleStockage',     r."filename",
              'nomOriginal',     r."originalName",
              'mimeType',        r."mimeType",
              'tailleOctets',    r."sizeBytes",
              -- Typé : un NULL nu laisse jsonb_build_object sans type d entree.
              'texteAlternatif', NULL::text,
              'estPrincipale',   r."estVignette",
              'position',        r."rang",
              'deposeePar',      r."uploadedBy",
              'deposeeLe',       r."createdAt"
            )
            ORDER BY r."rang"
          ) AS "photos"
        FROM "rangee" r
        GROUP BY r."projectId"
      )
      UPDATE "projet" p
      SET "photos" = g."photos"
      FROM "galerie" g
      WHERE g."projectId" = p."id"
    `);

    // Les lignes reprises quittent la table des documents : elles y sont
    // désormais un doublon, et un doublon que plus aucun code ne lit.
    await queryRunner.query(
      `DELETE FROM "document" WHERE "type" = 'PHOTO_PROJET'`,
    );

    await queryRunner.query(`
      ALTER TABLE "document"
        DROP COLUMN IF EXISTS "ordre",
        DROP COLUMN IF EXISTS "estPrincipale"
    `);

    // Le `jsonb` n'a de défaut que pour les lignes à venir ; celles qui
    // existaient portent `NULL`, que le domaine tolère mais que rien n'oblige à
    // laisser tel quel.
    await queryRunner.query(
      `UPDATE "projet" SET "blocsDeContenu" = '[]'::jsonb WHERE "blocsDeContenu" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "projet" SET "photos" = '[]'::jsonb WHERE "photos" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document"
        ADD COLUMN IF NOT EXISTS "ordre" integer DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "estPrincipale" boolean NOT NULL DEFAULT false
    `);

    // Les photos redeviennent des documents, avec leurs identifiants d'origine.
    await queryRunner.query(`
      INSERT INTO "document" (
        "id", "type", "relatedTo", "userId", "projectId", "investmentId",
        "originalName", "filename", "mimeType", "sizeBytes", "path",
        "isPublic", "uploadedBy", "ordre", "estPrincipale", "createdAt"
      )
      SELECT
        (photo->>'id')::uuid,
        'PHOTO_PROJET',
        'PROJECT',
        NULL,
        p."id",
        NULL,
        photo->>'nomOriginal',
        photo->>'cleStockage',
        photo->>'mimeType',
        (photo->>'tailleOctets')::int,
        photo->>'url',
        true,
        (photo->>'deposeePar')::int,
        (photo->>'position')::int,
        (photo->>'estPrincipale')::boolean,
        (photo->>'deposeeLe')::timestamptz
      FROM "projet" p,
           jsonb_array_elements(COALESCE(p."photos", '[]'::jsonb)) AS photo
      ON CONFLICT ("id") DO NOTHING
    `);

    // Les blocs de contenu, eux, n'ont pas d'équivalent avant cette migration :
    // les redescendre supposerait un endroit où les mettre, et il n'y en a pas.
    // `down` les perd, et c'est le seul choix honnête.
    await queryRunner.query(`
      ALTER TABLE "projet"
        DROP COLUMN IF EXISTS "descriptionCourte",
        DROP COLUMN IF EXISTS "blocsDeContenu",
        DROP COLUMN IF EXISTS "photos"
    `);
  }
}
