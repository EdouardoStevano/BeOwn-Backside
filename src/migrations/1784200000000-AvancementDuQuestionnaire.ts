import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le questionnaire d'adéquation date chacune de ses trois étapes.
 *
 * Le cahier des charges décrit un parcours en trois temps — pré-qualification,
 * qualification, simulation de la capacité à subir des pertes — dont chacun
 * peut clore la suite : le professionnel « n'a pas besoin de compléter les
 * étapes suivantes », et « seuls les investisseurs non-avertis doivent
 * compléter l'étape suivante ». Le formulaire arrivait pourtant d'un seul bloc,
 * par une route unique, et le front devait deviner seul quel volet afficher.
 *
 * **Trois colonnes suffisent à découper le parcours, et rien de moins.** Toutes
 * les réponses des étapes 1 et 2 sont des booléens `NOT NULL DEFAULT false` :
 * un titulaire qui répond « non » aux trois critères de pré-qualification écrit
 * exactement la ligne de celui qui n'a jamais ouvert le formulaire. Sans une
 * marque du passage, « quelle étape reste-t-il à poser ? » n'a pas de réponse.
 * Ce sont donc des **dates**, pas des booléens : savoir *quand* chaque
 * déclaration a été faite est de toute façon ce que RG-Q-07 demande de
 * conserver dix ans.
 *
 * **Les questionnaires existants sont réputés complets**, les trois dates
 * reprenant leur `updatedAt`. C'est exact : la route historique exige le
 * formulaire entier — les cinq booléens de l'étape 2 et l'acceptation de la
 * perte simulée y sont obligatoires — donc toute ligne déjà écrite l'a été par
 * un passage des trois étapes. Les laisser à `NULL` aurait renvoyé chacun de
 * ces titulaires à l'étape 1 alors qu'ils ont un classement acquis.
 */
export class AvancementDuQuestionnaire1784200000000 implements MigrationInterface {
  name = 'AvancementDuQuestionnaire1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const colonne of [
      'preQualificationRepondueLe',
      'qualificationRepondueLe',
      'capaciteRepondueLe',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "questionnaire_adequation" ADD COLUMN IF NOT EXISTS "${colonne}" TIMESTAMP WITH TIME ZONE`,
      );
    }

    // `WHERE … IS NULL` rend la reprise rejouable : une seconde exécution ne
    // réécrit pas des dates déjà posées par un passage étape par étape.
    await queryRunner.query(`
      UPDATE "questionnaire_adequation"
      SET "preQualificationRepondueLe" = COALESCE("preQualificationRepondueLe", "updatedAt"),
          "qualificationRepondueLe"    = COALESCE("qualificationRepondueLe", "updatedAt"),
          "capaciteRepondueLe"         = COALESCE("capaciteRepondueLe", "updatedAt")
      WHERE "preQualificationRepondueLe" IS NULL
         OR "qualificationRepondueLe" IS NULL
         OR "capaciteRepondueLe" IS NULL
    `);
  }

  /**
   * Retour arrière.
   *
   * Rien à reprendre : les réponses elles-mêmes ne bougent pas, seule la trace
   * de leur date disparaît. Le questionnaire redevient ce qu'il était — répondu
   * ou inexistant, sans état intermédiaire — et les trois routes par étape
   * cessent avec les colonnes qui les portaient.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const colonne of [
      'preQualificationRepondueLe',
      'qualificationRepondueLe',
      'capaciteRepondueLe',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "questionnaire_adequation" DROP COLUMN IF EXISTS "${colonne}"`,
      );
    }
  }
}
