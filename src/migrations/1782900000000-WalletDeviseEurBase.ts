import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bascule de la devise de base XOF → EUR (feat/euro-comms-suppression).
 *
 * - Les DEFAULT des colonnes `devise` de `wallet` et `transaction_paiement`
 *   passent de 'XOF' à 'EUR' (alignés sur les entités).
 * - Les lignes existantes `devise = 'XOF'` sont re-étiquetées 'EUR'.
 *
 * IMPORTANT : les MONTANTS ne sont PAS convertis. C'est une bascule
 * SÉMANTIQUE — les montants stockés sont désormais interprétés comme des
 * euros. Les données pré-EUR des environnements dev/staging sont des données
 * de test ; toute base contenant des montants réellement libellés en XOF
 * devrait être reseedée (schema:drop + npm run seed), pas migrée.
 */
export class WalletDeviseEurBase1782900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet" ALTER COLUMN "devise" SET DEFAULT 'EUR'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_paiement" ALTER COLUMN "devise" SET DEFAULT 'EUR'`,
    );
    await queryRunner.query(
      `UPDATE "wallet" SET "devise" = 'EUR' WHERE "devise" = 'XOF'`,
    );
    await queryRunner.query(
      `UPDATE "transaction_paiement" SET "devise" = 'EUR' WHERE "devise" = 'XOF'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "transaction_paiement" SET "devise" = 'XOF' WHERE "devise" = 'EUR'`,
    );
    await queryRunner.query(
      `UPDATE "wallet" SET "devise" = 'XOF' WHERE "devise" = 'EUR'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_paiement" ALTER COLUMN "devise" SET DEFAULT 'XOF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet" ALTER COLUMN "devise" SET DEFAULT 'XOF'`,
    );
  }
}
