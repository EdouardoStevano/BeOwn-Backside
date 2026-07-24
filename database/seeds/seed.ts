import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

dotenv.config();

async function runMigrations(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'pass123',
    database: process.env.DATABASE_DB || 'postgres',
    migrations: ['database/migrations/*.ts'],
    migrationsTableName: 'typeorm_migrations',
  });

  await dataSource.initialize();
  const pending = await dataSource.showMigrations();
  if (pending) {
    console.log('⏳ Exécution des migrations...');
    await dataSource.runMigrations();
    console.log('✅ Migrations exécutées');
  } else {
    console.log('✅ Migrations déjà à jour');
  }
  await dataSource.destroy();
}

async function bootstrap() {
  await runMigrations();

  const app = await NestFactory.createApplicationContext(SeedModule);
  const seedService = app.get(SeedService);
  const force = process.env.FORCE_SEED === 'true';
  if (force) {
    console.log(
      '⚠️ FORCE_SEED activé - les données existantes seront conservées mais de nouvelles données seront ajoutées',
    );
  }
  await seedService.seed(force);
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Erreur seed:', err);
  process.exit(1);
});
