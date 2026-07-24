import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_log : acteurId/objetId passent de uuid à varchar — l'intercepteur
 * d'audit y écrit des identifiants arbitraires (ids numériques de routes,
 * userId JWT non-uuid) et les inserts échouaient silencieusement sur une
 * colonne uuid. Ajoute aussi les index composites de consultation du journal
 * (mêmes noms que les @Index de l'entité pour rester en phase avec
 * synchronize en dev).
 */
export class AuditLogVarcharAndIndexes1782000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "acteurId" TYPE varchar USING "acteurId"::varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "objetId" TYPE varchar USING "objetId"::varchar`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_acteurId_createdAt" ON "audit_log" ("acteurId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_objetType_createdAt" ON "audit_log" ("objetType", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_log_objetType_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_log_acteurId_createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "objetId" TYPE uuid USING "objetId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ALTER COLUMN "acteurId" TYPE uuid USING "acteurId"::uuid`,
    );
  }
}
