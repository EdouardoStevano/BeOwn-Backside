import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBeneficiaireEffectif1747530500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Créer la table sans FK d'abord (profil_personne_morale peut ne pas exister encore)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "beneficiaire_effectif" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "profilPMId" integer NOT NULL,
        "prenom" character varying NOT NULL,
        "nom" character varying NOT NULL,
        "dateNaissance" date NULL,
        "nationalite" character varying NULL,
        "pourcentageDetention" numeric(5,2) NOT NULL,
        "pieceIdentiteDocId" character varying NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_beneficiaire_effectif" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_beneficiaire_effectif_profilPMId"
      ON "beneficiaire_effectif" ("profilPMId")
    `);
    // Ajouter la FK uniquement si profil_personne_morale existe
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'profil_personne_morale'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_beneficiaire_effectif_profilPM'
        ) THEN
          ALTER TABLE "beneficiaire_effectif"
            ADD CONSTRAINT "FK_beneficiaire_effectif_profilPM"
            FOREIGN KEY ("profilPMId")
            REFERENCES "profil_personne_morale" ("utilisateurId")
            ON DELETE CASCADE;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_beneficiaire_effectif_profilPMId"`);
    await queryRunner.query(`DROP TABLE "beneficiaire_effectif"`);
  }
}
