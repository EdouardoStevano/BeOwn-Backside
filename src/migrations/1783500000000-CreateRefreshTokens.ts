import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Table des sessions de rafraîchissement.
 *
 * Le refresh token ne vivait qu'en Redis, sous une clé par **compte** :
 * une seule session à la fois, et toutes perdues au moindre redémarrage du
 * cache. Cette table apporte les deux : une ligne par session — donc autant
 * d'appareils que le titulaire en connecte — et une durée de vie qui ne dépend
 * plus de la mémoire d'un conteneur.
 *
 * Aucune reprise de données : les sessions en cours vivent dans le cache, qui
 * les sert encore. Elles s'éteindront d'elles-mêmes au premier renouvellement,
 * qui réécrira la session des deux côtés — un titulaire connecté ne verra rien.
 */
export class CreateRefreshTokens1783500000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" SERIAL NOT NULL,
        "utilisateurId" integer NOT NULL,
        "refreshTokenId" character varying(64) NOT NULL,
        "expireLe" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);

    // Les deux accès du port : valider un couple (compte, identifiant), et
    // fermer toutes les sessions d'un compte. L'unicité interdit par ailleurs
    // qu'un identifiant de rotation soit enregistré deux fois.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_refresh_tokens_utilisateur_token"
      ON "refresh_tokens" ("utilisateurId", "refreshTokenId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_refresh_tokens_utilisateur_token"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
