import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `tfa_methods` (héritage table unique) → `mfa_methods` (table plate).
 *
 * Le discriminant `type_method` devient une colonne métier `method`
 * (`totp` | `email` | `sms`), et les trois colonnes concurrentes — dont deux
 * étaient toujours nulles sur chaque ligne — fusionnent dans `credential` :
 *
 *   totp_methods  → method='totp',  credential = secretKeyOtp    (secret chiffré)
 *   email_methods → method='email', credential = emailOTP        (adresse)
 *   sms_methods   → method='sms',   credential = phoneNumberOTP  (numéro E.164)
 *
 * Migration de **données**, pas seulement de schéma : la table porte les
 * seconds facteurs des comptes en production. Une recréation à vide
 * déconnecterait tous les utilisateurs ayant activé la 2FA de leur propre
 * compte.
 *
 * Les lignes dont le `credential` serait nul sont écartées : sans secret ni
 * destination, un facteur ne peut plus rien prouver — le conserver donnerait
 * une ligne inexploitable qui ferait échouer la contrainte NOT NULL.
 */
export class MergeTfaMethodsIntoMfaMethods1783200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mfa_methods" (
        "id" SERIAL NOT NULL,
        "method" character varying(16) NOT NULL,
        "credential" character varying NOT NULL,
        "isActive" boolean NOT NULL DEFAULT false,
        "activatedDate" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" integer,
        CONSTRAINT "PK_mfa_methods" PRIMARY KEY ("id"),
        -- ON DELETE NO ACTION, comme le portait l'ancienne table : la
        -- suppression de compte passe par un changement de statut, jamais par
        -- un DELETE.
        -- Poser CASCADE ici changerait un comportement que ce refactor n'a pas
        -- à trancher.
        CONSTRAINT "FK_mfa_methods_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("userId") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mfa_methods_user_method" ON "mfa_methods" ("user_id", "method")`,
    );

    // Reprise de l'unicité que portait `emailOTP`, restreinte au canal email :
    // dans la table fusionnée, une contrainte sur toute la colonne mettrait en
    // concurrence des secrets TOTP, des numéros et des adresses.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mfa_methods_email_credential" ON "mfa_methods" ("credential") WHERE "method" = 'email'`,
    );

    // La table n'existe pas sur une base neuve : rien à reprendre, le schéma
    // ci-dessus suffit. Sur une base déjà en service, les lignes sont reprises
    // canal par canal.
    const legacy = await queryRunner.hasTable('tfa_methods');
    if (!legacy) return;

    await queryRunner.query(`
      INSERT INTO "mfa_methods" ("method", "credential", "isActive", "activatedDate", "user_id")
      SELECT
        CASE "type_method"
          WHEN 'totp_methods'  THEN 'totp'
          WHEN 'email_methods' THEN 'email'
          WHEN 'sms_methods'   THEN 'sms'
        END,
        COALESCE("secretKeyOtp", "emailOTP", "phoneNumberOTP"),
        "isActive",
        "activatedDate",
        "user_id"
      FROM "tfa_methods"
      WHERE "type_method" IN ('totp_methods', 'email_methods', 'sms_methods')
        AND COALESCE("secretKeyOtp", "emailOTP", "phoneNumberOTP") IS NOT NULL
    `);

    await queryRunner.query(`DROP TABLE "tfa_methods"`);
  }

  /**
   * Retour en arrière : reconstruit la table à héritage et réétale
   * `credential` dans la colonne du canal d'origine.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tfa_methods" (
        "TFAMethodId" SERIAL NOT NULL,
        "isActive" boolean NOT NULL,
        "activatedDate" TIMESTAMP NOT NULL DEFAULT now(),
        "secretKeyOtp" character varying,
        "phoneNumberOTP" character varying,
        "emailOTP" character varying,
        "type_method" character varying NOT NULL,
        "user_id" integer,
        CONSTRAINT "PK_tfa_methods" PRIMARY KEY ("TFAMethodId"),
        CONSTRAINT "UQ_tfa_methods_emailOTP" UNIQUE ("emailOTP"),
        CONSTRAINT "FK_tfa_methods_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("userId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tfa_methods_type" ON "tfa_methods" ("type_method")`,
    );

    await queryRunner.query(`
      INSERT INTO "tfa_methods" ("isActive", "activatedDate", "secretKeyOtp", "emailOTP", "phoneNumberOTP", "type_method", "user_id")
      SELECT
        "isActive",
        "activatedDate",
        CASE WHEN "method" = 'totp'  THEN "credential" END,
        CASE WHEN "method" = 'email' THEN "credential" END,
        CASE WHEN "method" = 'sms'   THEN "credential" END,
        CASE "method"
          WHEN 'totp'  THEN 'totp_methods'
          WHEN 'email' THEN 'email_methods'
          WHEN 'sms'   THEN 'sms_methods'
        END,
        "user_id"
      FROM "mfa_methods"
    `);

    await queryRunner.query(`DROP TABLE "mfa_methods"`);
  }
}
