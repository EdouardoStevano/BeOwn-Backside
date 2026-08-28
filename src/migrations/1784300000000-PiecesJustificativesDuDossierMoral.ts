import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les pièces justificatives du dossier personne morale ont leur table.
 *
 * Le cahier des charges les énumère — *« KBIS de moins de 3 mois, Statuts à
 * jour et signés, Liste des actionnaires à jour »*, plus le formulaire DBE-S1
 * et une pièce d'identité par bénéficiaire effectif — et rien dans le projet ne
 * les portait. La table `document` du contexte `documents` sait stocker des
 * fichiers, mais elle ne connaît qu'un `userId` : depuis qu'un compte déclare
 * plusieurs sociétés, un KBIS rattaché au titulaire ne désigne plus une
 * entreprise mais un ensemble.
 *
 * Trois choses que la table apporte et que le stockage de fichiers seul ne
 * pouvait pas donner :
 *
 * 1. **le rattachement à la société** (`societeId`), donc la possibilité de dire
 *    si *ce* dossier-là est complet ;
 * 2. **un statut par pièce**, sans quoi « l'utilisateur pourra modifier
 *    lui-même les documents refusés » est irréalisable — seul le dossier KYC
 *    entier avait un statut, et il ne dit pas quelle pièce corriger ;
 * 3. **une date d'émission**, à quoi la règle des trois mois du KBIS s'applique.
 *    C'est la date d'émission et non celle du dépôt : redéposer un extrait de
 *    janvier en juin ne le rajeunit pas.
 *
 * **L'unicité est portée par deux contraintes, pas une.** Une pièce documente
 * soit la société, soit un bénéficiaire précis, et il n'en faut qu'une par
 * chose documentée — sinon un dossier accumule trois extraits contradictoires
 * dont personne ne sait lequel fait foi. Or en Postgres, `NULL` n'est jamais
 * égal à `NULL` dans un index unique : la contrainte à trois colonnes laisse
 * donc passer autant de KBIS qu'on veut, tous avec `beneficiaireId IS NULL`.
 * Un **index partiel** couvre ce cas, et la contrainte à trois colonnes couvre
 * l'autre.
 */
export class PiecesJustificativesDuDossierMoral1784300000000 implements MigrationInterface {
  name = 'PiecesJustificativesDuDossierMoral1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "piece_justificative" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "societeId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "beneficiaireId" uuid,
        "nomOrigine" character varying NOT NULL,
        "cleStockage" character varying NOT NULL,
        "url" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "tailleOctets" integer NOT NULL,
        "dateEmission" date,
        "statut" character varying NOT NULL DEFAULT 'en_attente',
        "motifRefus" character varying(500),
        "decideeLe" TIMESTAMP WITH TIME ZONE,
        "deposeeLe" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_piece_justificative" PRIMARY KEY ("id"),
        CONSTRAINT "FK_piece_societe" FOREIGN KEY ("societeId")
          REFERENCES "profil_personne_morale"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_piece_societe" ON "piece_justificative" ("societeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_piece_statut" ON "piece_justificative" ("statut")`,
    );

    // Une pièce par bénéficiaire et par type. Ne couvre **pas** les pièces de
    // société : leurs `beneficiaireId` sont nuls, et deux `NULL` ne s'égalent
    // pas — l'index les considère toutes distinctes.
    await queryRunner.query(
      `ALTER TABLE "piece_justificative" DROP CONSTRAINT IF EXISTS "UQ_piece_societe_type_beneficiaire"`,
    );
    await queryRunner.query(
      `ALTER TABLE "piece_justificative" ADD CONSTRAINT "UQ_piece_societe_type_beneficiaire" UNIQUE ("societeId", "type", "beneficiaireId")`,
    );

    // D'où celui-ci, qui les couvre : une seule pièce de chaque type par
    // société lorsqu'aucun bénéficiaire n'est désigné.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_piece_societe_type_sans_beneficiaire"
        ON "piece_justificative" ("societeId", "type")
        WHERE "beneficiaireId" IS NULL
    `);
  }

  /**
   * Retour arrière : la table part avec ses pièces.
   *
   * Les fichiers eux-mêmes restent dans le magasin — ils ne sont pas ici, et
   * leur conservation de cinq ans (RG-KYC-10) survit à un retour de schéma.
   * Ce sont leurs clés qui disparaissent, donc le moyen de les retrouver : ne
   * redescendre que sur un environnement dont les dépôts sont sans valeur.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_piece_societe_type_sans_beneficiaire"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "piece_justificative"`);
  }
}
