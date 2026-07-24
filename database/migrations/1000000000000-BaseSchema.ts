import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseSchema1000000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── spv ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "spv" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "raisonSociale" varchar NOT NULL,
        "siren" varchar,
        "forme" varchar,
        "capitalSocial" decimal(18,2),
        "siegeAdresse" varchar,
        "iban" varchar,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_spv" PRIMARY KEY ("id")
      )
    `);

    // ── admin_settings ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_settings" (
        "id" varchar NOT NULL DEFAULT 'default',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_settings" PRIMARY KEY ("id")
      )
    `);

    // ── news ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "news" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar NOT NULL UNIQUE,
        "titreFr" varchar NOT NULL,
        "titreEn" varchar,
        "contenuFr" text NOT NULL,
        "contenuEn" text,
        "resumeFr" text,
        "resumeEn" text,
        "imageUrl" varchar,
        "category" varchar,
        "statut" varchar NOT NULL DEFAULT 'draft',
        "publishedAt" TIMESTAMPTZ,
        "authorId" integer,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_news" PRIMARY KEY ("id")
      )
    `);

    // ── audit_log ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" SERIAL NOT NULL,
        "acteurId" uuid,
        "role" varchar,
        "action" varchar NOT NULL,
        "objetType" varchar,
        "objetId" uuid,
        "ip" inet,
        "userAgent" varchar,
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id")
      )
    `);

    // ── users ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "userId" SERIAL NOT NULL,
        "firstname" varchar,
        "lastname" varchar,
        "socialId" varchar,
        "password" varchar,
        "role" varchar NOT NULL DEFAULT 'investisseur',
        "status" varchar NOT NULL DEFAULT 'cree',
        "cguAccepteesLe" TIMESTAMP,
        "lastLoginAt" TIMESTAMP,
        "userType" varchar,
        "cgpId" integer,
        "cgpReferralCode" varchar,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_8bf09ba754322ab9c22a215c919" PRIMARY KEY ("userId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_2025eaefc4e1b443c84f6ca9b2" ON "users" ("socialId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_cgpReferralCode" ON "users" ("cgpReferralCode") WHERE "cgpReferralCode" IS NOT NULL`);

    // ── user_emails ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_emails" (
        "userId" SERIAL NOT NULL,
        "email" varchar NOT NULL,
        "isVerified" boolean NOT NULL DEFAULT false,
        "verifiedDate" TIMESTAMP,
        "user_id" integer,
        CONSTRAINT "REL_2e88b95787b903d46ab3cc3eb9" UNIQUE ("user_id"),
        CONSTRAINT "PK_569342223a28f006d9bf897c7c9" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_user_emails_user" FOREIGN KEY ("user_id") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);

    // ── user_preferences ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "userId" integer NOT NULL,
        "langue" varchar NOT NULL DEFAULT 'fr',
        "masquerMontants" boolean NOT NULL DEFAULT false,
        "notifEmail" boolean NOT NULL DEFAULT true,
        "notifSms" boolean NOT NULL DEFAULT false,
        "notifMarketing" boolean NOT NULL DEFAULT false,
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "preferredCurrency" varchar NOT NULL DEFAULT 'EUR',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_preferences" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_user_preferences_user" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE
      )
    `);

    // ── tfa_methods ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tfa_methods" (
        "TFAMethodId" SERIAL NOT NULL,
        "isActive" boolean NOT NULL,
        "activatedDate" TIMESTAMP NOT NULL DEFAULT now(),
        "secretKeyOtp" varchar,
        "phoneNumberOTP" varchar,
        "emailOTP" varchar,
        "type_method" varchar NOT NULL,
        "user_id" integer,
        CONSTRAINT "UQ_eb3417033e99e3f89ece05d4f67" UNIQUE ("emailOTP"),
        CONSTRAINT "PK_cfb2cd00764ac509b752337f41d" PRIMARY KEY ("TFAMethodId"),
        CONSTRAINT "FK_tfa_methods_user" FOREIGN KEY ("user_id") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bf1c9c94568f6e26329581efa1" ON "tfa_methods" ("type_method")`);

    // ── document ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "relatedTo" varchar NOT NULL,
        "userId" integer,
        "projectId" uuid,
        "investmentId" uuid,
        "originalName" varchar NOT NULL,
        "filename" varchar NOT NULL,
        "mimeType" varchar NOT NULL,
        "sizeBytes" integer NOT NULL,
        "path" varchar NOT NULL,
        "isPublic" boolean NOT NULL DEFAULT false,
        "uploadedBy" integer NOT NULL,
        "ordre" integer DEFAULT NULL,
        "estPrincipale" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_userId" ON "document" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_projectId" ON "document" ("projectId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_document_investmentId" ON "document" ("investmentId")`);

    // ── kyc ───────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "utilisateurId" integer NOT NULL,
        "statut" varchar NOT NULL DEFAULT 'non_demarre',
        "niveau" varchar NOT NULL DEFAULT 'standard',
        "scoreRisque" integer,
        "fournisseur" varchar NOT NULL DEFAULT 'stripe',
        "fournisseurRef" varchar,
        "valideJusquAu" date,
        "motifRefus" varchar,
        "stripeReportId" varchar,
        "identiteExtrait" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_kyc_utilisateurId" ON "kyc" ("utilisateurId")`);

    // ── profil_personne_physique ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profil_personne_physique" (
        "utilisateurId" integer NOT NULL,
        "civilite" varchar,
        "dateNaissance" date,
        "lieuNaissance" varchar,
        "nationalite" char(2),
        "adresseLigne1" varchar,
        "adresseLigne2" varchar,
        "codePostal" varchar,
        "ville" varchar,
        "pays" char(2),
        "telephone" varchar,
        "profession" varchar,
        "secteurActivite" varchar,
        "pep" boolean NOT NULL DEFAULT false,
        "residenceFiscale" char(2),
        "nif" varchar,
        "categoriePsfp" varchar NOT NULL DEFAULT 'non_averti',
        "patrimoineDeclare" numeric(15,2),
        "montantMaxConseille" numeric(15,2),
        "niveauRisque" varchar,
        "dernierContactAdmin" TIMESTAMPTZ,
        "prochainContactDu" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profil_pp" PRIMARY KEY ("utilisateurId"),
        CONSTRAINT "FK_profil_pp_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);

    // ── profil_personne_morale ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profil_personne_morale" (
        "utilisateurId" integer NOT NULL,
        "raisonSociale" varchar NOT NULL,
        "formeJuridique" varchar,
        "siren" varchar,
        "rcsVille" varchar,
        "capitalSocial" decimal(18,2),
        "siegeAdresse" varchar,
        "representantId" integer,
        "secteurActivite" varchar,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profil_pm" PRIMARY KEY ("utilisateurId"),
        CONSTRAINT "FK_profil_pm_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);

    // ── notification ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "utilisateurId" integer,
        "canal" varchar,
        "type" varchar,
        "titre" varchar,
        "message" text,
        "lu" boolean NOT NULL DEFAULT false,
        "templateCode" varchar,
        "statut" varchar,
        "envoyeLe" TIMESTAMPTZ,
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notification_utilisateurId" ON "notification" ("utilisateurId")`);

    // ── wallet ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "proprietaireUserId" integer,
        "projetId" uuid,
        "spvId" uuid,
        "fournisseurRef" varchar NOT NULL,
        "devise" char(3) NOT NULL DEFAULT 'XOF',
        "solde" decimal(18,2) NOT NULL DEFAULT 0,
        "statut" varchar NOT NULL DEFAULT 'actif',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_user" FOREIGN KEY ("proprietaireUserId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_wallet_proprietaireUserId" ON "wallet" ("proprietaireUserId")`);

    // ── signature ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "signature" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "youSignRequestId" varchar NOT NULL,
        "youSignSignerId" varchar NOT NULL,
        "youSignSigningUrl" text,
        "documentId" uuid NOT NULL,
        "investmentId" uuid,
        "ordreId" uuid,
        "nbFractions" integer,
        "userId" integer NOT NULL,
        "statut" varchar NOT NULL DEFAULT 'pending',
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "signedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_signature" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_signature_youSignRequestId" ON "signature" ("youSignRequestId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_signature_documentId" ON "signature" ("documentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_signature_investmentId" ON "signature" ("investmentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_signature_ordreId" ON "signature" ("ordreId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_signature_userId" ON "signature" ("userId")`);

    // ── projet ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "projet" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar NOT NULL UNIQUE,
        "titre" varchar NOT NULL,
        "spvId" uuid,
        "porteurId" integer,
        "type" varchar NOT NULL,
        "ville" varchar,
        "region" varchar,
        "pays" char(2) NOT NULL DEFAULT 'FR',
        "adresseComplete" varchar,
        "latitude" decimal(10,7),
        "longitude" decimal(10,7),
        "youtubeUrl" varchar,
        "capitalCible" decimal(18,2) NOT NULL,
        "capitalMinimum" decimal(18,2) NOT NULL,
        "ticketMinimum" decimal(18,2) NOT NULL DEFAULT 100,
        "ticketMaximum" decimal(18,2),
        "triCible" decimal(5,2),
        "dureeMois" integer NOT NULL,
        "instrument" varchar NOT NULL,
        "statut" varchar NOT NULL DEFAULT 'brouillon',
        "estPreInvestissable" boolean NOT NULL DEFAULT false,
        "plafondPreInvestissement" decimal(18,2),
        "nbFractions" integer,
        "prixFraction" decimal(18,2),
        "datePublication" TIMESTAMPTZ,
        "dateOuvertureCollecte" TIMESTAMPTZ,
        "dateCloturePrevue" TIMESTAMPTZ,
        "descriptionMd" text,
        "avertissementMd" text,
        "previsionnel" jsonb,
        "chronologie" jsonb DEFAULT '[]',
        "garanties" jsonb DEFAULT '[]',
        "echeancierEmprunteur" jsonb DEFAULT '[]',
        "motifAnnulation" text,
        "annuleLe" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_projet" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projet_spv" FOREIGN KEY ("spvId") REFERENCES "spv"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_projet_statut" ON "projet" ("statut")`);

    // ── transaction_paiement ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_paiement" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "walletSource" uuid,
        "wallet_source" uuid,
        "walletDestination" uuid,
        "montant" decimal(18,2) NOT NULL,
        "devise" char(3) NOT NULL DEFAULT 'XOF',
        "type" varchar NOT NULL,
        "referenceExterne" varchar,
        "fournisseur" varchar NOT NULL DEFAULT 'stripe',
        "fournisseurRef" varchar,
        "statut" varchar NOT NULL DEFAULT 'initie',
        "investissementId" uuid,
        "echeanceId" uuid,
        "reservationId" uuid,
        "projetId" uuid,
        "idempotencyKey" varchar UNIQUE,
        "fraisPsp" decimal(18,2) NOT NULL DEFAULT 0,
        "fraisPlateforme" decimal(18,2) NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "motifEchec" varchar,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_paiement" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transaction_investissementId" ON "transaction_paiement" ("investissementId")`);

    // ── reservation ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reservation" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projetId" uuid NOT NULL,
        "utilisateurId" integer NOT NULL,
        "montantReserve" decimal(18,2) NOT NULL,
        "rangFile" integer,
        "statut" varchar NOT NULL DEFAULT 'en_attente',
        "confirmationJusquAu" TIMESTAMPTZ,
        "investissementId" uuid,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reservation" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservation_projet" FOREIGN KEY ("projetId") REFERENCES "projet"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_reservation_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reservation_projetId" ON "reservation" ("projetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reservation_utilisateurId" ON "reservation" ("utilisateurId")`);

    // ── investissement ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "investissement" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projetId" uuid NOT NULL,
        "utilisateurId" integer NOT NULL,
        "montant" decimal(18,2) NOT NULL,
        "instrument" varchar NOT NULL,
        "nbTitres" integer,
        "valeurTitre" decimal(18,2),
        "statut" varchar NOT NULL DEFAULT 'initie',
        "delaiRetractationJusquAu" TIMESTAMPTZ,
        "bulletinDocId" uuid,
        "signatureId" uuid,
        "reservationId" uuid,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_investissement" PRIMARY KEY ("id"),
        CONSTRAINT "FK_investissement_projet" FOREIGN KEY ("projetId") REFERENCES "projet"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_investissement_user" FOREIGN KEY ("utilisateurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_investissement_projetId" ON "investissement" ("projetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_investissement_utilisateurId" ON "investissement" ("utilisateurId")`);

    // ── echeance ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "echeance" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "investissementId" uuid NOT NULL,
        "numero" integer NOT NULL,
        "datePrevue" date NOT NULL,
        "montantCapital" decimal(18,2) NOT NULL DEFAULT 0,
        "montantInterets" decimal(18,2) NOT NULL DEFAULT 0,
        "montantTotal" decimal(18,2) NOT NULL DEFAULT 0,
        "prelevementIR" decimal(14,2) NOT NULL DEFAULT 0,
        "prelevementCSG" decimal(14,2) NOT NULL DEFAULT 0,
        "statut" varchar NOT NULL DEFAULT 'a_venir',
        "payeLe" TIMESTAMPTZ,
        "rappelJ7Envoye" boolean NOT NULL DEFAULT false,
        "rappelJ1Envoye" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_echeance" PRIMARY KEY ("id"),
        CONSTRAINT "FK_echeance_investissement" FOREIGN KEY ("investissementId") REFERENCES "investissement"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_echeance_investissementId" ON "echeance" ("investissementId")`);

    // ── ordre_marche ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ordre_marche" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "investissementId" uuid NOT NULL,
        "vendeurId" integer NOT NULL,
        "acheteurId" integer,
        "sens" varchar NOT NULL,
        "nbFractions" integer NOT NULL DEFAULT 0,
        "montant" decimal(18,2) NOT NULL,
        "prixUnitaire" decimal(18,2) NOT NULL,
        "statut" varchar NOT NULL DEFAULT 'en_carnet',
        "valideJusquAu" date,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordre_marche" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ordre_marche_investissement" FOREIGN KEY ("investissementId") REFERENCES "investissement"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_ordre_marche_vendeur" FOREIGN KEY ("vendeurId") REFERENCES "users"("userId") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ordre_marche_investissementId" ON "ordre_marche" ("investissementId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ordre_marche_vendeurId" ON "ordre_marche" ("vendeurId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ordre_marche"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "echeance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "investissement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservation"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_paiement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "signature"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profil_personne_morale"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profil_personne_physique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tfa_methods"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_emails"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "news"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "spv"`);
  }
}
