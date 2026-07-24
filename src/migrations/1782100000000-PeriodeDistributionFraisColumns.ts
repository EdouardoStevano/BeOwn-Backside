import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * periode_distribution : ajoute les colonnes fraisPlateformeAnnuel /
 * fraisGestionLocative / fraisPlafonnes.
 *
 * Contexte : ces frais sont désormais calculés (snapshot de taux figé) mais
 * PAS encaissés au calcul — ils sont simplement persistés sur la période et
 * rejoués (crédit wallet + transactions ledger) à l'exécution. Ça restaure
 * l'invariant "l'argent ne bouge qu'à l'exécution" : annuler une période
 * CALCULEE/VALIDEE ne laisse plus de frais fantômes déjà prélevés.
 */
export class PeriodeDistributionFraisColumns1782100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" ADD COLUMN IF NOT EXISTS "fraisPlateformeAnnuel" decimal(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" ADD COLUMN IF NOT EXISTS "fraisGestionLocative" decimal(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" ADD COLUMN IF NOT EXISTS "fraisPlafonnes" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" DROP COLUMN IF EXISTS "fraisPlafonnes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" DROP COLUMN IF EXISTS "fraisGestionLocative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "periode_distribution" DROP COLUMN IF EXISTS "fraisPlateformeAnnuel"`,
    );
  }
}
