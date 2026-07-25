import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le schéma introduit par le Lot E :
 *  - colonnes Stripe Connect Express sur `users` (retrait investisseur, E3)
 *  - table `project_view` (traçage des consultations projet, E-UX / double-consultation)
 *
 * Additive et idempotente (IF NOT EXISTS) : sûre à appliquer sur une base déjà
 * construite par le synchronize du seed comme sur une base fraîche.
 */
export class AddStripeConnectAndProjectView1783100000000
  implements MigrationInterface
{
  name = 'AddStripeConnectAndProjectView1783100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" character varying`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeConnectPayoutsEnabled" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeConnectChargesEnabled" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeConnectDetailsSubmitted" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS "project_view" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "projetId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_project_view_id" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_view_user_projet" ON "project_view" ("userId", "projetId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_project_view_user_projet"`);
    await q.query(`DROP TABLE IF EXISTS "project_view"`);
    await q.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectDetailsSubmitted"`,
    );
    await q.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectChargesEnabled"`,
    );
    await q.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectPayoutsEnabled"`,
    );
    await q.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectAccountId"`,
    );
  }
}
