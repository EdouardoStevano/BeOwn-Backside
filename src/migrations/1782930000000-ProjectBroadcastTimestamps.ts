import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Horodatages anti-doublon des diffusions (feat/euro-comms-suppression, V2-T5).
 *
 * `broadcastAnnonceAt` : campagne « ouverture de réservation » (passage du
 * projet en annonce). `broadcastCollecteAt` : campagne « nouveau projet »
 * (passage en collecte). BroadcastService les pose AVANT d'envoyer quoi que ce
 * soit : une colonne non nulle = campagne déjà diffusée, l'appel devient un
 * no-op. La prod tourne en synchronize:false, d'où cette migration ; en dev la
 * colonne existe déjà (synchronize) — ADD COLUMN IF NOT EXISTS la rend
 * rejouable partout.
 */
export class ProjectBroadcastTimestamps1782930000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "broadcastAnnonceAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "projet" ADD COLUMN IF NOT EXISTS "broadcastCollecteAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projet" DROP COLUMN IF EXISTS "broadcastCollecteAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projet" DROP COLUMN IF EXISTS "broadcastAnnonceAt"`,
    );
  }
}
