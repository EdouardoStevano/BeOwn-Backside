// ⚠ ORDRE D'IMPORT CRITIQUE — 2 contraintes, dans cet ordre exact.
//
// 1. `dotenv/config` EN TOUT PREMIER. Deux modules lisent `process.env` au
//    moment de leur ÉVALUATION (import), donc bien avant que le ConfigModule
//    de Nest n'ait chargé le fichier `.env` :
//      - `observability/tracing/otel` (OTEL_EXPORTER_OTLP_ENDPOINT) ;
//      - `notifications/presenters/ws/notification.gateway` — le décorateur
//        `@WebSocketGateway({ cors: { origin: [process.env.FRONTEND_URL …] } })`
//        est évalué au chargement d'AppModule. Sans ce chargement préalable,
//        les origines CORS du WebSocket retombaient sur les valeurs localhost
//        codées en dur : en déploiement les variables viennent du ConfigMap
//        (donc déjà dans l'environnement du process, cas nominal), mais tout
//        lancement s'appuyant sur un fichier `.env` (poste local, conteneur
//        lancé à la main, script one-shot) partait avec de mauvaises origines
//        et le temps réel restait muet, sans erreur visible.
//    `dotenv` n'écrase jamais une variable déjà présente dans l'environnement :
//    en Kubernetes, où ConfigMap et Secret sont injectés par le kubelet, cet
//    appel est donc un no-op strict. Il vient de @nestjs/config (dépendance
//    directe) qui l'embarque ; à promouvoir en dépendance explicite du
//    package.json au prochain `npm install`.
//
// 2. `observability/tracing/otel` juste après, et avant tout import qui charge
//    http/express/pg/ioredis (directement ou via NestFactory/AppModule), sous
//    peine de traces vides (les auto-instrumentations monkey-patchent au
//    `require`). `dotenv` ne charge que `fs`/`path` : le placer devant ne casse
//    aucune instrumentation.
import 'dotenv/config';
import './observability/tracing/otel';
import { initSentry } from './observability/sentry';
import { SentryExceptionFilter } from './observability/sentry-exception.filter';

import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';
import helmet from 'helmet';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // Init Sentry avant tout (après le tracing OTel importé ci-dessus) : capture
  // aussi les erreurs qui surviendraient pendant le bootstrap Nest lui-même.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  // Bascule le logger Nest sur pino (JSON structuré, redaction RGPD, corrélation
  // traceId) dès que possible — `bufferLogs` retient les logs de bootstrap
  // émis avant ce point et les rejoue au bon format.
  app.useLogger(app.get(PinoLogger));

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  app.useWebSocketAdapter(new IoAdapter(app));

  // M-5 — derrière un ingress/Nginx, `req.ip` vaut l'IP du proxy pour TOUS les
  // clients : la limitation de débit devient un seau commun (un client peut
  // verrouiller la connexion de tout le monde — constaté en test) et ne
  // distingue plus l'attaquant. `trust proxy` fait lire l'IP réelle dans
  // X-Forwarded-For.
  //
  // La valeur est le NOMBRE DE PROXYS de confiance devant l'application, à
  // régler selon le déploiement (1 = un ingress). Elle n'est jamais mise à
  // `true` : faire confiance à un nombre illimité de sauts laisserait un
  // client falsifier son IP en injectant lui-même l'en-tête, et donc
  // contourner toute limitation. Défaut 0 = comportement historique (aucun
  // proxy), pour ne rien changer en développement.
  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10);
  if (Number.isFinite(trustProxyHops) && trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

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
        `BeOwn permet l'investissement fractionné dans l'immobilier africain. ` +
        `La plateforme ne détient aucun agrément d'autorité de marché et n'est ` +
        `soumise à la supervision d'aucune d'entre elles.\n\n` +
        `### Authentification\n` +
        `La majorité des routes nécessitent un **JWT Bearer token** obtenu via \`POST /auth/sign-in\`.\n` +
        `Utilisez le bouton **Authorize** ci-dessus pour renseigner votre token.\n\n` +
        `### Flux principal\n` +
        `1. \`POST /auth/sign-up\` — Créer un compte\n` +
        `2. \`POST /auth/email/send-verification\` + \`GET /auth/email/verify?token=...\` — Vérifier l'email\n` +
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

  // Exposition de Swagger pilotée par un interrupteur EXPLICITE, défaut fermé.
  //
  // L'ancienne condition `NODE_ENV !== 'production'` ouvrait `/api/docs` en
  // accès public sur dev, staging ET test — trois environnements exposés sur
  // Internet (api-dev / api-staging / api-test .beown.fr). La documentation y
  // publie la cartographie complète des routes, des payloads et des règles de
  // validation : c'est une aide au repérage offerte gratuitement, sur des
  // environnements qui portent des données de test réalistes.
  //
  // Désormais : rien n'est exposé tant que `SWAGGER_ENABLED=true` n'est pas
  // posé délibérément (poste local, ou activation temporaire d'un
  // environnement le temps d'une session d'intégration). Un environnement mal
  // configuré tombe du côté fermé.
  if (process.env.SWAGGER_ENABLED === 'true') {
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
    // `sentry-trace` et `baggage` sont injectés par le browserTracing de Sentry
    // côté front (uniquement vers l'API BeOwn, via tracePropagationTargets) :
    // sans eux dans cette liste, le préflight échoue et TOUTE requête est
    // bloquée par le navigateur — c'est la corrélation de traces front↔back qui
    // les rend nécessaires, pas un confort.
    allowedHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage'],
  });

  // Arrêt gracieux — indispensable au rolling update (maxUnavailable: 0).
  //
  // Sans ces hooks, le SIGTERM envoyé par le kubelet coupe le process
  // immédiatement : toute requête HTTP en vol est tuée, les sockets WebSocket
  // sont fermés brutalement, et les connexions PostgreSQL/Redis ne sont pas
  // rendues. À chaque déploiement, les utilisateurs en cours d'action prennent
  // une erreur réseau — un incident silencieux, invisible dans les métriques
  // serveur puisque le process n'a jamais eu l'occasion de journaliser.
  //
  // Avec `enableShutdownHooks`, Nest intercepte SIGTERM, arrête d'accepter de
  // nouvelles connexions, laisse finir celles en cours et déclenche
  // `onModuleDestroy`/`onApplicationShutdown` sur tous les providers (dont
  // `RedisThrottlerStorage.onApplicationShutdown`).
  //
  // Le cycle complet côté k8s : `preStop: sleep 10` laisse l'endpoint sortir
  // des tables de routage AVANT le SIGTERM, puis
  // `terminationGracePeriodSeconds: 45` borne le drainage
  // (cf. k8s/base/deployment.yaml).
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
