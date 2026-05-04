import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

async function bootstrap() {
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
