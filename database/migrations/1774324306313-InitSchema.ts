import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1774324306313 implements MigrationInterface {
  name = 'InitSchema1774324306313';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Users ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "userId"           SERIAL          NOT NULL,
        "firstname"        varchar,
        "lastname"         varchar,
        "socialId"         varchar,
        "password"         varchar,
        "role"             varchar         NOT NULL DEFAULT 'investisseur',
        "status"           varchar         NOT NULL DEFAULT 'cree',
        "cguAccepteesLe"   TIMESTAMP,
        "lastLoginAt"      TIMESTAMP,
        "userType"         varchar,
        "createdAt"        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("userId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_socialId"
      ON "users" ("socialId") WHERE "socialId" IS NOT NULL
    `);

    // ── User emails ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_emails" (
        "userId"        SERIAL    NOT NULL,
        "email"         varchar   NOT NULL,
        "isVerified"    boolean   NOT NULL DEFAULT false,
        "verifiedDate"  TIMESTAMP,
        "user_id"       integer,
        CONSTRAINT "UQ_user_emails_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_user_emails" PRIMARY KEY ("userId")
      )
    `);

    // ── TFA methods ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tfa_methods" (
        "TFAMethodId"     SERIAL   NOT NULL,
        "isActive"        boolean  NOT NULL,
        "activatedDate"   TIMESTAMP NOT NULL DEFAULT now(),
        "secretKeyOtp"    varchar,
        "phoneNumberOTP"  varchar,
        "emailOTP"        varchar,
        "type_method"     varchar  NOT NULL,
        "user_id"         integer,
        CONSTRAINT "UQ_tfa_emailOTP"  UNIQUE ("emailOTP"),
        CONSTRAINT "PK_tfa_methods"   PRIMARY KEY ("TFAMethodId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tfa_methods_type"
      ON "tfa_methods" ("type_method")
    `);

    // ── SPV ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "spv" (
        "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
        "raisonSociale" varchar NOT NULL,
        "siren"         varchar,
        "forme"         varchar,
        "capitalSocial" numeric(18,2),
        "siegeAdresse"  varchar,
        "iban"          varchar,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_spv" PRIMARY KEY ("id")
      )
    `);

    // ── Projet ─────────────────────────────────────────────────────────
    // Inclut les colonnes de AddProjectRichFields (déjà passé, a sauté)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projet" (
        "id"                        uuid        NOT NULL DEFAULT gen_random_uuid(),
        "slug"                      varchar     NOT NULL,
        "titre"                     varchar     NOT NULL,
        "spvId"                     uuid,
        "porteurId"                 integer,
        "type"                      varchar     NOT NULL,
        "ville"                     varchar,
        "region"                    varchar,
        "pays"                      char(2)     NOT NULL DEFAULT 'FR',
        "capitalCible"              numeric(18,2) NOT NULL,
        "capitalMinimum"            numeric(18,2) NOT NULL,
        "ticketMinimum"             numeric(18,2) NOT NULL DEFAULT 100,
        "ticketMaximum"             numeric(18,2),
        "triCible"                  numeric(5,2),
        "dureeMois"                 integer     NOT NULL,
        "instrument"                varchar     NOT NULL,
        "statut"                    varchar     NOT NULL DEFAULT 'brouillon',
        "estPreInvestissable"       boolean     NOT NULL DEFAULT false,
        "plafondPreInvestissement"  numeric(18,2),
        "datePublication"           TIMESTAMPTZ,
        "dateOuvertureCollecte"     TIMESTAMPTZ,
        "dateCloturePrevue"         TIMESTAMPTZ,
        "descriptionMd"             text,
        "avertissementMd"           text,
        "adresseComplete"           varchar,
        "latitude"                  decimal(10,7),
        "longitude"                 decimal(10,7),
        "youtubeUrl"                varchar,
        "nbFractions"               integer,
        "prixFraction"              decimal(18,2),
        "previsionnel"              jsonb,
        "chronologie"               jsonb NOT NULL DEFAULT '[]',
        "garanties"                 jsonb NOT NULL DEFAULT '[]',
        "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_projet_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_projet"      PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projet_statut" ON "projet" ("statut")
    `);

    // ── Wallet ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet" (
        "id"                  uuid        NOT NULL DEFAULT gen_random_uuid(),
        "type"                varchar     NOT NULL,
        "proprietaireUserId"  integer,
        "projetId"            uuid,
        "spvId"               uuid,
        "fournisseurRef"      varchar     NOT NULL,
        "devise"              char(3)     NOT NULL DEFAULT 'XOF',
        "solde"               numeric(18,2) NOT NULL DEFAULT 0,
        "statut"              varchar     NOT NULL DEFAULT 'actif',
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_proprietaireUserId"
      ON "wallet" ("proprietaireUserId")
    `);

    // ── Investissement ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "investissement" (
        "id"                       uuid        NOT NULL DEFAULT gen_random_uuid(),
        "projetId"                 uuid        NOT NULL,
        "utilisateurId"            integer     NOT NULL,
        "montant"                  numeric(18,2) NOT NULL,
        "instrument"               varchar     NOT NULL,
        "nbTitres"                 integer,
        "valeurTitre"              numeric(18,2),
        "statut"                   varchar     NOT NULL DEFAULT 'initie',
        "delaiRetractationJusquAu" TIMESTAMPTZ,
        "bulletinDocId"            uuid,
        "signatureId"              uuid,
        "reservationId"            uuid,
        "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_investissement" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_investissement_projetId"      ON "investissement" ("projetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_investissement_utilisateurId" ON "investissement" ("utilisateurId")`);

    // ── Echeance ───────────────────────────────────────────────────────
    // Inclut prelevementIR/CSG (AddFiscalFieldsToEcheance a déjà sauté)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "echeance" (
        "id"               uuid          NOT NULL DEFAULT gen_random_uuid(),
        "investissementId" uuid          NOT NULL,
        "numero"           integer       NOT NULL,
        "datePrevue"       date          NOT NULL,
        "montantCapital"   numeric(18,2) NOT NULL DEFAULT 0,
        "montantInterets"  numeric(18,2) NOT NULL DEFAULT 0,
        "montantTotal"     numeric(18,2) NOT NULL DEFAULT 0,
        "statut"           varchar       NOT NULL DEFAULT 'a_venir',
        "payeLe"           TIMESTAMPTZ,
        "prelevementIR"    decimal(14,2) NOT NULL DEFAULT 0,
        "prelevementCSG"   decimal(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_echeance" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_echeance_investissementId"
      ON "echeance" ("investissementId")
    `);

    // ── Reservation ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reservation" (
        "id"                  uuid          NOT NULL DEFAULT gen_random_uuid(),
        "projetId"            uuid          NOT NULL,
        "utilisateurId"       integer       NOT NULL,
        "montantReserve"      numeric(18,2) NOT NULL,
        "rangFile"            integer,
        "statut"              varchar       NOT NULL DEFAULT 'en_attente',
        "confirmationJusquAu" TIMESTAMPTZ,
        "investissementId"    uuid,
        "createdAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reservation" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reservation_projetId"      ON "reservation" ("projetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reservation_utilisateurId" ON "reservation" ("utilisateurId")`);

    // ── Profil PP ──────────────────────────────────────────────────────
    // Inclut patrimoineDeclare/montantMaxConseille (AddPsfpFieldsToProfilPP a sauté)
    // Inclut niveauRisque/dernierContactAdmin/prochainContactDu (AddRiskScoringToProfilPP a sauté)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profil_personne_physique" (
        "utilisateurId"       integer       NOT NULL,
        "civilite"            varchar,
        "prenom"              varchar       NOT NULL,
        "nom"                 varchar       NOT NULL,
        "nomNaissance"        varchar,
        "dateNaissance"       date          NOT NULL,
        "lieuNaissance"       varchar,
        "paysNaissance"       char(2),
        "nationalite"         char(2),
        "adresseLigne1"       varchar,
        "adresseLigne2"       varchar,
        "codePostal"          varchar,
        "ville"               varchar,
        "pays"                char(2),
        "telephone"           varchar,
        "profession"          varchar,
        "secteurActivite"     varchar,
        "pep"                 boolean       NOT NULL DEFAULT false,
        "residenceFiscale"    char(2),
        "nif"                 varchar,
        "categoriePsfp"       varchar       NOT NULL DEFAULT 'non_averti',
        "patrimoineDeclare"   numeric(15,2),
        "montantMaxConseille" numeric(15,2),
        "niveauRisque"        varchar,
        "dernierContactAdmin" TIMESTAMPTZ,
        "prochainContactDu"   TIMESTAMPTZ,
        "createdAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profil_pp" PRIMARY KEY ("utilisateurId")
      )
    `);

    // ── Profil PM ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profil_personne_morale" (
        "utilisateurId"   integer       NOT NULL,
        "raisonSociale"   varchar       NOT NULL,
        "formeJuridique"  varchar,
        "siren"           varchar,
        "rcsVille"        varchar,
        "capitalSocial"   numeric(18,2),
        "siegeAdresse"    varchar,
        "representantId"  integer,
        "secteurActivite" varchar,
        "createdAt"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profil_pm" PRIMARY KEY ("utilisateurId")
      )
    `);

    // ── KYC ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc" (
        "id"              uuid      NOT NULL DEFAULT gen_random_uuid(),
        "utilisateurId"   integer   NOT NULL,
        "statut"          varchar   NOT NULL DEFAULT 'non_demarre',
        "niveau"          varchar   NOT NULL DEFAULT 'standard',
        "scoreRisque"     integer,
        "fournisseur"     varchar   NOT NULL DEFAULT 'stripe',
        "fournisseurRef"  varchar,
        "valideJusquAu"   date,
        "motifRefus"      varchar,
        "stripeReportId"  varchar,
        "identiteExtrait" jsonb,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kyc_utilisateurId" ON "kyc" ("utilisateurId")
    `);

    // ── FK constraints (toutes conditionnelles) ────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_2e88b95787b903d46ab3cc3eb91') THEN
          ALTER TABLE "user_emails" ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91"
            FOREIGN KEY ("user_id") REFERENCES "users"("userId")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bb0f7b313bc22dcbd060c97d8d4') THEN
          ALTER TABLE "tfa_methods" ADD CONSTRAINT "FK_bb0f7b313bc22dcbd060c97d8d4"
            FOREIGN KEY ("user_id") REFERENCES "users"("userId")
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$
    `);
    // Ajouter la FK de beneficiaire_effectif maintenant que profil_personne_morale existe
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'beneficiaire_effectif'
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
    await queryRunner.query(`ALTER TABLE "beneficiaire_effectif" DROP CONSTRAINT IF EXISTS "FK_beneficiaire_effectif_profilPM"`);
    await queryRunner.query(`ALTER TABLE "tfa_methods"  DROP CONSTRAINT IF EXISTS "FK_bb0f7b313bc22dcbd060c97d8d4"`);
    await queryRunner.query(`ALTER TABLE "user_emails"  DROP CONSTRAINT IF EXISTS "FK_2e88b95787b903d46ab3cc3eb91"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profil_personne_morale"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profil_personne_physique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "echeance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "investissement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "spv"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tfa_methods"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_emails"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
