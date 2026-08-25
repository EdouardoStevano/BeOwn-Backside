import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le téléphone repart de `users` vers `profil_personne_physique`.
 *
 * `MoveIdentityToUser` l'avait emmené avec le prénom et le nom, au motif qu'un
 * numéro joint une personne et non un dossier. Le raisonnement valait pour
 * l'état civil, qui était **recopié** du compte et donc dupliqué ; il ne valait
 * pas pour le numéro, qui n'existait qu'à un seul endroit. Ce que le titulaire
 * déclare en remplissant son dossier — son adresse, son numéro — appartient au
 * dossier : c'est une coordonnée du même ordre que l'adresse postale, et elle
 * suit le même cycle de vie. Le prénom et le nom, eux, restent sur le compte.
 *
 * Ce que le retour coûte, et qui est assumé : un compte sans dossier n'a plus
 * de numéro, et supprimer un dossier efface le sien.
 *
 * Même ordre prudent qu'à l'aller — on ajoute, on reprend, on retire — pour
 * qu'une interruption entre deux étapes laisse une base lisible par l'ancien
 * code comme par le nouveau.
 */
export class MoveTelephoneBackToProfilPP1783600000000 implements MigrationInterface {
  name = 'MoveTelephoneBackToProfilPP1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" ADD COLUMN IF NOT EXISTS "telephone" character varying`,
    );

    // `WHERE p."telephone" IS NULL` rend l'opération rejouable : relancée, elle
    // n'écrase pas un numéro saisi depuis dans le dossier.
    await queryRunner.query(`
      UPDATE "profil_personne_physique" p
      SET "telephone" = u."telephone"
      FROM "users" u
      WHERE p."utilisateurId" = u."userId"
        AND u."telephone" IS NOT NULL
        AND p."telephone" IS NULL
    `);

    // Les numéros des comptes sans dossier sont perdus ici — c'est exactement
    // la contrepartie annoncée plus haut, et il n'y a pas de ligne où les
    // poser sans inventer un dossier vide que le domaine refuserait.
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "telephone"`,
    );
  }

  /** Retour arrière : la colonne du compte revient, réalimentée par le dossier. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telephone" character varying`,
    );

    await queryRunner.query(`
      UPDATE "users" u
      SET "telephone" = p."telephone"
      FROM "profil_personne_physique" p
      WHERE p."utilisateurId" = u."userId"
        AND p."telephone" IS NOT NULL
        AND u."telephone" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "profil_personne_physique" DROP COLUMN IF EXISTS "telephone"`,
    );
  }
}
