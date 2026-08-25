import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le dossier personne physique gagne une identité propre.
 *
 * `utilisateurId` était sa clé primaire : le dossier et son titulaire ne
 * faisaient qu'une seule identité. Or ce sont deux choses distinctes — un
 * compte existe sans dossier (il s'inscrit avant de le remplir), un dossier
 * n'existe pas sans compte. La relation 1:1 se dit désormais là où elle se
 * dit vraiment : une contrainte d'unicité sur la colonne de rattachement, qui
 * prend au passage le nom qu'elle porte partout ailleurs dans l'API.
 *
 * Ordre : on ajoute l'identité (avec un uuid pour chaque ligne existante), on
 * renomme, puis seulement on déplace la clé primaire. La table reste lisible
 * entre deux étapes.
 *
 * La clé étrangère vers `users` est **reposée explicitement**, et pas
 * seulement héritée. Elle existait bien dans `InitSchema` — renommer une
 * colonne emmène d'ailleurs ses contraintes avec elle — mais plusieurs
 * `InitSchema` concurrents ont créé cette table, tous n'ont pas tourné partout,
 * et rien dans le code ne garantissait laquelle. Une base où la contrainte
 * manque accepte silencieusement un `userId` qui ne désigne aucun compte : le
 * dossier devient orphelin, et le `GET /users/me` du titulaire le lit sans
 * jamais retrouver son propriétaire. On ne suppose donc plus : on retire ce
 * qui traîne et on repose la contrainte sous un nom lisible.
 *
 * `ON DELETE NO ACTION` maintenu — supprimer un compte qui a un dossier reste
 * refusé. C'est l'autre moitié de l'invariant : un dossier n'existe pas sans
 * compte, ni au moment de l'écriture, ni après coup.
 */
export class ProfilPPOwnIdentity1783700000000 implements MigrationInterface {
  name = 'ProfilPPOwnIdentity1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `gen_random_uuid()` est natif depuis Postgres 13 — pas d'extension à
    // installer. Le DEFAULT remplit les lignes déjà là, et couvre ensuite les
    // insertions qui ne fourniraient pas d'identité.
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL DEFAULT gen_random_uuid()`,
    );

    // Postgres n'a pas de `RENAME COLUMN IF EXISTS` : le garde le rend
    // rejouable, et permet de relancer la migration sur une base déjà à jour.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'profil_personne_physique'
            AND column_name = 'utilisateurId'
        ) THEN
          ALTER TABLE "profil_personne_physique"
            RENAME COLUMN "utilisateurId" TO "userId";
        END IF;
      END $$;
    `);

    // La clé primaire déménage. Son nom se lit dans le catalogue et ne se
    // devine pas : la table a été créée par plusieurs `InitSchema` concurrents,
    // dont les noms générés diffèrent, et un `DROP CONSTRAINT IF EXISTS` sur le
    // mauvais nom ne fait rien — on ajoute alors une seconde clé primaire, ce
    // que Postgres refuse (42P16). Rien ne référence celle du dossier, aucune
    // table n'ayant de clé étrangère vers `profil_personne_physique`, donc le
    // retrait ne casse aucune contrainte.
    await queryRunner.query(`
      DO $$
      DECLARE contrainte text;
      BEGIN
        SELECT conname INTO contrainte
        FROM pg_constraint
        WHERE conrelid = '"profil_personne_physique"'::regclass
          AND contype = 'p';

        IF contrainte IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE "profil_personne_physique" DROP CONSTRAINT %I',
            contrainte
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD CONSTRAINT "PK_profil_pp" PRIMARY KEY ("id")`,
    );

    // Ce que la clé primaire imposait au passage, et qu'il faut réénoncer :
    // un compte, au plus un dossier — et pas de dossier sans compte.
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ALTER COLUMN "userId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP CONSTRAINT IF EXISTS "UQ_profil_pp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD CONSTRAINT "UQ_profil_pp_user" UNIQUE ("userId")`,
    );

    // Un dossier orphelin ferait échouer la contrainte sur une erreur
    // Postgres qui ne dit pas quoi faire. Mieux vaut nommer le problème : ces
    // lignes désignent des comptes qui n'existent pas, il faut décider de leur
    // sort — les rattacher ou les supprimer — avant de rejouer la migration.
    await queryRunner.query(`
      DO $$
      DECLARE orphelins bigint;
      BEGIN
        SELECT count(*) INTO orphelins
        FROM "profil_personne_physique" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "users" u WHERE u."userId" = p."userId"
        );

        IF orphelins > 0 THEN
          RAISE EXCEPTION
            '% dossier(s) personne physique ne se rattachent à aucun compte. Rattachez-les ou supprimez-les avant de poser la clé étrangère.',
            orphelins;
        END IF;
      END $$;
    `);

    // Toutes les clés étrangères de la table, quel que soit leur nom : les
    // `InitSchema` successifs en ont posé sous au moins deux noms générés
    // (`FK_36b8cc0…` sur `utilisateurId`, `FK_04f4787…` sur un ancien
    // `utilisateur_id`), et la table n'a qu'une seule référence légitime — le
    // compte. Les énumérer depuis le catalogue évite d'en deviner les noms.
    await queryRunner.query(`
      DO $$
      DECLARE contrainte text;
      BEGIN
        FOR contrainte IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = '"profil_personne_physique"'::regclass
            AND contype = 'f'
        LOOP
          EXECUTE format(
            'ALTER TABLE "profil_personne_physique" DROP CONSTRAINT %I',
            contrainte
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD CONSTRAINT "FK_profil_pp_user" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  /** Retour arrière : la clé primaire revient sur le rattachement au compte. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP CONSTRAINT IF EXISTS "FK_profil_pp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP CONSTRAINT IF EXISTS "UQ_profil_pp_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP CONSTRAINT IF EXISTS "PK_profil_pp"`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'profil_personne_physique'
            AND column_name = 'userId'
        ) THEN
          ALTER TABLE "profil_personne_physique"
            RENAME COLUMN "userId" TO "utilisateurId";
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD CONSTRAINT "PK_36b8cc065c10a18573332696429" PRIMARY KEY ("utilisateurId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP COLUMN IF EXISTS "id"`,
    );

    // Les deux contraintes reprennent les noms que leur donnait `InitSchema`.
    // Ils peuvent différer de ceux qu'une base donnée portait vraiment — leur
    // génération n'a pas été la même partout — mais cela reste sans
    // conséquence : `up` retrouve les contraintes par le catalogue, jamais par
    // leur nom.
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD CONSTRAINT "FK_36b8cc065c10a18573332696429" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
