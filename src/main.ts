import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';
import helmet from 'helmet';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  // Ressources publiques servies telles quelles : le logo que les applications
  // authenticator vont chercher via le paramètre `image` de l'URI otpauth
  // (cf. `TotpSecretService`). Elles téléchargent cette URL depuis le
  // téléphone de l'utilisateur, sans en-tête d'authentification — le dossier
  // doit donc rester joignable publiquement, et ne contenir que des fichiers
  // destinés à l'être.
  app.use('/images', express.static(join(process.cwd(), 'images')));

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
        `La majorité des routes nécessitent un **JWT Bearer token** obtenu via \`POST /auth/sign-in\`.\n` +
        `Utilisez le bouton **Authorize** ci-dessus pour renseigner votre token.\n\n` +
        `### Flux principal\n` +
        `1. \`POST /auth/sign-up\` — Créer un compte\n` +
        `2. \`POST /auth/email/send-verification\` + \`GET /auth/email/verify?token=...\` — Vérifier l'email\n` +
        `3. \`POST /auth/sign-in\` — Obtenir les tokens\n` +
        `4. \`POST /profiles/pp/me\` + \`POST /profiles/kyc/me\` — Compléter le profil KYC\n` +
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
    // Un seul tag pour tout le parcours d'authentification : `Email
    // Verification` et `OTP / 2FA` étaient trois modules distincts, ils sont
    // désormais une seule feature servie sous `/auth`.
    .addTag(
      'Authentication',
      'Connexion, inscription, OAuth social, tokens JWT, vérification ' +
        "d'adresse email (`/auth/email/*`) " +
        'et double authentification (`/auth/mfa/*`) — TOTP, email ou SMS, le ' +
        'canal étant choisi dans le body de `POST /auth/mfa/enroll`. Un ' +
        'compte muni d’un facteur actif reçoit un 401 `MFA_REQUIRED` sur ' +
        '`POST /auth/sign-in`, puis termine sa connexion par ' +
        '`POST /auth/sign-in/mfa`.',
    )
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
