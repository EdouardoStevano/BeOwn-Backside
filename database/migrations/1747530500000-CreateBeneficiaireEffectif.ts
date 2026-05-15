import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBeneficiaireEffectif1747530500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "beneficiaire_effectif" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profilPMId" integer NOT NULL,
        "prenom" character varying NOT NULL,
        "nom" character varying NOT NULL,
        "dateNaissance" date NULL,
        "nationalite" character varying NULL,
        "pourcentageDetention" numeric(5,2) NOT NULL,
        "pieceIdentiteDocId" character varying NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_beneficiaire_effectif" PRIMARY KEY ("id"),
        CONSTRAINT "FK_beneficiaire_effectif_profilPM"
          FOREIGN KEY ("profilPMId")
          REFERENCES "profil_personne_morale" ("utilisateurId")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_beneficiaire_effectif_profilPMId"
      ON "beneficiaire_effectif" ("profilPMId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_beneficiaire_effectif_profilPMId"`);
    await queryRunner.query(`DROP TABLE "beneficiaire_effectif"`);
  }
}
