import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAdminToSuperAdmin1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE users SET role = 'super_admin' WHERE role = 'admin'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE users SET role = 'admin' WHERE role = 'super_admin'`,
    );
  }
}
