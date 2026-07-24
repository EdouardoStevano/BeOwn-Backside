import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://*.stripe.com',
            'https://js.stripe.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          frameSrc: ["'self'", 'https://*.stripe.com'],
          connectSrc: [
            "'self'",
            process.env.FRONTEND_URL ?? 'http://localhost:5173',
            process.env.ADMIN_URL ?? 'http://localhost:5174',
            'https://*.stripe.com',
            'https://*.stripe.network',
          ],
        },
      },
    }),
  );

  app.use(
    '/payments/webhook/stripe',
    express.raw({ type: 'application/json' }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('BeOwn API')
    .setDescription(
      `## Plateforme d'investissement immobilier fractionné — Afrique\n\n` +
        `BeOwn est une plateforme PSFP (Prestataire de Services de Financement Participatif) ` +
        `permettant l'investissement fractionné dans l'immobilier africain.\n\n` +
        `### Authentification\n` +
        `La majorité des routes nécessitent un **JWT Bearer token** okay obtenu via \`POST /auth/sign-in\`.\n` +
        `Utilisez le bouton **Authorize** ci-dessus pour renseigner votre token.\n\n` +
        `### Flux principal\n` +
        `1. \`POST /auth/sign-up\` — Créer un compte\n` +
        `2. \`POST /email/send-verification\` + \`GET /email/verify?token=...\` — Vérifier l'email\n` +
        `3. \`POST /auth/sign-in\` — Obtenir les tokens\n` +
        `4. \`POST /profiles/:userId/pp\` + \`POST /profiles/:userId/kyc\` — Compléter le profil KYC\n` +
        `5. \`GET /projects\` — Parcourir les projets\n` +
        `6. \`POST /payments/depot/intent\` — Déposer des fonds\n` +
        `7. \`POST /investments\` — Investir dans un projet`,
    )
    .setVersion('1.0.0')
    .addServer(
      `http://localhost:${process.env.API_URL ?? 3002}`,
      'Développement local',
    )
    .addServer('https://api.beown.fr', 'Production')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      in: 'header',
    })
    .addTag('Health', "Vérification de l'état de l'API")
    .addTag(
      'Authentication',
      'Connexion, inscription, OAuth social, tokens JWT',
    )
    .addTag('Email Verification', "Envoi et confirmation d'email")
    .addTag('OTP / 2FA', 'OTP par email et TOTP (Google Authenticator)')
    .addTag('Users', 'Gestion des comptes utilisateurs')
    .addTag('Profiles & KYC', 'Profil investisseur (PP/PM) et dossier KYC')
    .addTag('Projects', 'Projets immobiliers — CRUD, statuts, SPV')
    .addTag(
      'Reservations (Pré-investissement)',
      'Réservations de parts avant ouverture de collecte',
    )
    .addTag('Investments', 'Souscriptions, échéanciers, portfolio')
    .addTag(
      'Wallets & Transactions',
      'Wallets investisseurs et historique des transactions',
    )
    .addTag('Payments & KYC', 'Stripe PaymentIntent, retraits, Stripe Identity')
    .addTag('Marché Secondaire', "Carnet d'ordres, vente/achat de parts")
    .addTag(
      'Documents',
      'Upload et gestion des documents (KYC, projet, investissement)',
    )
    .addTag('Notifications', 'Notifications in-app et email')
    .build();

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: false,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'BeOwn API Docs',
    });
  }

  const allowedOrigins = [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    process.env.ADMIN_URL ?? 'http://localhost:5174',
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
