import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuestionnaireAdequation1747528500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "questionnaire_adequation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "utilisateurId" integer NOT NULL,
        "workInFinancialSector" boolean NOT NULL DEFAULT false,
        "moreThan10TransactionsPerQuarter" boolean NOT NULL DEFAULT false,
        "portfolioOver500k" boolean NOT NULL DEFAULT false,
        "previousUnlistedInvestments" boolean NOT NULL DEFAULT false,
        "investmentExperienceOver5Years" boolean NOT NULL DEFAULT false,
        "financialPatrimonyOver500k" boolean NOT NULL DEFAULT false,
        "understandsTotalLossRisk" boolean NOT NULL DEFAULT false,
        "financialSectorBackground" boolean NOT NULL DEFAULT false,
        "patrimoineNet" numeric(14,2) NULL,
        "revenuAnnuel" numeric(14,2) NULL,
        "budgetAnnuelInvestissement" numeric(14,2) NULL,
        "acceptsSimulatedLoss" boolean NOT NULL DEFAULT false,
        "resultCategorie" character varying NULL,
        "resultMontantMaxConseille" numeric(14,2) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questionnaire_adequation" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_questionnaire_adequation_utilisateurId"
      ON "questionnaire_adequation" ("utilisateurId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_questionnaire_adequation_utilisateurId"`);
    await queryRunner.query(`DROP TABLE "questionnaire_adequation"`);
  }
}
