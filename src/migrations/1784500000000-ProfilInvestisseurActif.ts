import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un compte retient au nom de qui il agit.
 *
 * Le cahier des charges veut qu'un titulaire puisse *« investir via les
 * entreprises dont il est le représentant légal sans avoir besoin de se créer
 * plusieurs comptes »*. Il porte donc un dossier personne physique **et**
 * autant de sociétés qu'il en représente — mais rien ne disait, à un instant
 * donné, laquelle de ces identités est celle qui agit. Le front devait le
 * deviner, ou le redemander à chaque écran.
 *
 * Une ligne par compte, `userId` en clé primaire : on n'agit que pour une
 * identité à la fois, et l'unicité se lit là plutôt que dans un index à part.
 *
 * **`societeId` nul signifie « en son nom propre »**, et l'absence de ligne
 * aussi. Les deux se confondent volontairement : un compte qui n'a jamais
 * basculé agit pour lui-même. C'est le repli protecteur — agir pour soi
 * n'engage que soi, alors que retomber par défaut sur une société ferait
 * souscrire au nom d'une personne morale sans que personne l'ait demandé.
 *
 * `ON DELETE SET NULL` sur la société, et non `CASCADE` : si la société active
 * est supprimée, le compte doit retomber sur son nom propre plutôt que de voir
 * son choix disparaître avec elle.
 */
export class ProfilInvestisseurActif1784500000000 implements MigrationInterface {
  name = 'ProfilInvestisseurActif1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profil_investisseur_actif" (
        "userId" integer NOT NULL,
        "societeId" uuid,
        "basculeLe" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profil_investisseur_actif" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_profil_actif_user" FOREIGN KEY ("userId")
          REFERENCES "users"("userId") ON DELETE CASCADE,
        CONSTRAINT "FK_profil_actif_societe" FOREIGN KEY ("societeId")
          REFERENCES "profil_personne_morale"("id") ON DELETE SET NULL
      )
    `);
  }

  /**
   * Retour arrière : la table part avec les choix qu'elle portait.
   *
   * Aucune donnée métier n'est perdue — un profil actif est une désignation,
   * pas une déclaration. Les comptes retombent simplement sur leur nom propre,
   * ce qui est déjà le repli.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "profil_investisseur_actif"`,
    );
  }
}
