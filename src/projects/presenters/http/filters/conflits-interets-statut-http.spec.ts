import { INestApplication } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SentryExceptionFilter } from 'src/observability/sentry-exception.filter';
import { Sentry } from 'src/observability/sentry';
import { ConflitsInteretsErrorFilter } from './conflits-interets-error.filter';
import {
  DetenteurDePartsDeLaSocieteSupportError,
  PorteurDeSonPropreProjetError,
} from 'src/projects/domains/errors/conflits-interets.errors';
import { JwtAuthGuard } from 'src/common/auth/jwt-auth.guard';
import { KycValidatedGuard } from 'src/common/auth/kyc-validated.guard';
import { PorteurAccessGuard } from 'src/common/auth/porteur-access.guard';
import { InvestmentController } from 'src/investments/presenters/http/investment.controller';
import { ReservationController } from 'src/reservations/presenters/http/reservation.controller';
import { SecondaryMarketController } from 'src/secondarymarket/presenters/http/secondary-market.controller';
import { ProjectController } from 'src/projects/presenters/http/project.controller';
import { CreateInvestmentUseCase } from 'src/investments/applications/usecases/create-investment.usecase';
import { TopUpInvestmentUseCase } from 'src/investments/applications/usecases/top-up-investment.usecase';
import { CreateReservationUseCase } from 'src/reservations/applications/usecases/create-reservation.usecase';
import { ExprimerInteretUseCase } from 'src/secondarymarket/applications/usecases/exprimer-interet.usecase';
import { RepondreInteretUseCase } from 'src/secondarymarket/applications/usecases/repondre-interet.usecase';
import { CreateProjectUseCase } from 'src/projects/applications/usecases/create-project.usecase';

// Sentry est un namespace ES : ses propriétés ne sont pas redéfinissables, donc
// inespionnables par `jest.spyOn`. On mocke le module local qui le réexporte —
// c'est celui que le filtre importe.
jest.mock('src/observability/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

/**
 * STATUT HTTP RÉELLEMENT RENDU par l'application assemblée.
 *
 * ## Le trou que ce fichier bouche
 *
 * La règle D5 était éprouvée à tous les niveaux — domaine, service, sept use
 * cases, filtre pris isolément, résolveur d'audit — et pourtant, en recette,
 * chaque refus sortait en **500 Internal server error**. Rien de tout cela
 * n'était faux : le refus partait, le service le journalisait, aucune
 * souscription n'était créée, `audit_log` écrivait 403. Seul le CLIENT recevait
 * autre chose.
 *
 * Cause : `main.ts` fait `app.useGlobalFilters(new SentryExceptionFilter(...))`
 * APRÈS l'initialisation des modules. Nest assemble les filtres
 * `[globaux, contrôleur, méthode]`, INVERSE la liste, puis retient le premier
 * dont le `@Catch()` accepte l'exception : un attrape-tout (`@Catch()` nu)
 * enregistré en dernier passe donc avant tout `APP_FILTER` de module. Le module
 * IAM avait rencontré ce piège et documenté sa parade — `@UseFilters` de portée
 * contrôleur, qui passe toujours avant les globaux. Le pari « APP_FILTER
 * suffira » était le mauvais.
 *
 * Aucun test unitaire ne pouvait le voir : ils appelaient les use cases ou le
 * filtre directement, jamais la chaîne HTTP complète. D'où ce fichier, qui
 * monte les VRAIS contrôleurs derrière le MÊME assemblage de filtres que
 * `main.ts` et lit le statut sur le fil.
 */
/**
 * Noms auxquels le double NE doit PAS répondre, sous peine de casser le
 * montage :
 *  - `then` : un objet qui expose une fonction `then` est un « thenable », et
 *    l'`await` que Nest applique aux instances de providers ne se résout alors
 *    jamais — l'application pend jusqu'au timeout, sans la moindre erreur ;
 *  - les hooks de cycle de vie : Nest teste `typeof instance.onModuleInit ===
 *    'function'` et appelle ce qu'il trouve. Un double qui « répond » à
 *    `onModuleInit` par une promesse rejetée fait échouer `app.init()`.
 */
const NON_INTERCEPTES = new Set([
  'then',
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

/** Double universel : n'importe quelle autre méthode appelée rend `reponse()`. */
const doubleUniversel = (reponse: () => unknown): unknown =>
  new Proxy(
    {},
    {
      get: (_cible, propriete) =>
        typeof propriete === 'symbol' || NON_INTERCEPTES.has(propriete)
          ? undefined
          : () => reponse(),
    },
  );

describe('Conflits d’intérêts — statut HTTP rendu au client (application assemblée)', () => {
  const UTILISATEUR = {
    userId: 42,
    email: 'porteur@example.test',
    role: 'investisseur',
  };

  /** Erreur que les use cases ciblés rejettent — pilotée par chaque test. */
  let erreurLevee: unknown;

  /** Use cases gardés, tels qu'exposés en HTTP aujourd'hui. */
  const CIBLES = new Set<unknown>([
    CreateInvestmentUseCase,
    TopUpInvestmentUseCase,
    CreateReservationUseCase,
    ExprimerInteretUseCase,
    RepondreInteretUseCase,
    CreateProjectUseCase,
  ]);

  let app: INestApplication;

  beforeAll(async () => {
    const gardePassante = {
      canActivate: (contexte: any) => {
        contexte.switchToHttp().getRequest().user = UTILISATEUR;
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        InvestmentController,
        ReservationController,
        SecondaryMarketController,
        ProjectController,
      ],
      // Exactement ce que déclare `ConflitsInteretsModule`.
      providers: [{ provide: APP_FILTER, useClass: ConflitsInteretsErrorFilter }],
    })
      .useMocker((token) =>
        CIBLES.has(token)
          ? // Toute méthode du use case ciblé rejette l'erreur du test.
            doubleUniversel(() => Promise.reject(erreurLevee))
          : doubleUniversel(() => Promise.resolve(undefined)),
      )
      .overrideGuard(JwtAuthGuard)
      .useValue(gardePassante)
      .overrideGuard(KycValidatedGuard)
      .useValue(gardePassante)
      .overrideGuard(PorteurAccessGuard)
      .useValue(gardePassante)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    const { httpAdapter } = app.get(HttpAdapterHost);
    // ── La ligne exacte de `src/main.ts` — c'est elle qui rendait 500 ────────
    app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    (Sentry.captureException as jest.Mock).mockClear();
  });

  /**
   * Les portes d'entrée réellement exposées en HTTP.
   *
   * Deux use cases gardés n'y figurent pas, parce qu'aucune route ne les
   * atteint : `POST /investments/initiate` et
   * `POST /secondary-market/orders/:id/execute` sont débranchées en 410.
   * `InitiateInvestmentUseCase` et `InitiateBuyUseCase` restent gardés au
   * niveau du use case — l'un pour le jour où le parcours sera réunifié,
   * l'autre parce qu'il s'exécute derrière l'acceptation du vendeur, testée
   * ici.
   */
  const PORTES: Array<{
    nom: string;
    appeler: () => request.Test;
  }> = [
    {
      nom: 'POST /investments — souscription directe',
      appeler: () =>
        request(app.getHttpServer())
          .post('/investments')
          .send({ projetId: 'projet-1', nbFractions: 1 }),
    },
    {
      nom: 'PATCH /investments/:id/top-up — ajout de fractions',
      appeler: () =>
        request(app.getHttpServer())
          .patch('/investments/inv-1/top-up')
          .send({ nbFractions: 1 }),
    },
    {
      nom: 'POST /reservations — pré-investissement',
      appeler: () =>
        request(app.getHttpServer())
          .post('/reservations')
          .send({ projetId: 'projet-1', montant: 500 }),
    },
    {
      nom: 'POST /secondary-market/orders/:id/interet — marque d’intérêt',
      appeler: () =>
        request(app.getHttpServer())
          .post('/secondary-market/orders/ordre-1/interet')
          .send({ nbFractions: 2 }),
    },
    {
      nom: 'POST /secondary-market/orders/:id/interet/acceptation — acceptation vendeur',
      appeler: () =>
        request(app.getHttpServer())
          .post('/secondary-market/orders/ordre-1/interet/acceptation')
          .send({}),
    },
  ];

  it.each(PORTES.map((p) => [p.nom, p] as const))(
    '%s → 403 + code stable (et non 500)',
    async (_nom, porte) => {
      erreurLevee = new PorteurDeSonPropreProjetError('Vous portez ce projet.');

      const reponse = await porte.appeler();

      expect(reponse.status).toBe(403);
      expect(reponse.body).toMatchObject({
        statusCode: 403,
        code: 'CONFLIT_INTERETS_PORTEUR_DU_PROJET',
        error: 'Forbidden',
      });
      // Le message métier arrive intact : c'est lui que le front affiche.
      expect(reponse.body.message).toContain('Vous portez ce projet');
    },
  );

  it('POST /projects/submit — rattachement refusé → 409 + code (sens inverse)', async () => {
    erreurLevee = new DetenteurDePartsDeLaSocieteSupportError(
      'Vous détenez déjà des parts de la société support de ce projet.',
    );

    const reponse = await request(app.getHttpServer())
      .post('/projects/submit')
      .send({ titre: 'Résidence', spvId: 'spv-1' });

    expect(reponse.status).toBe(409);
    expect(reponse.body).toMatchObject({
      statusCode: 409,
      code: 'CONFLIT_INTERETS_DETENTION_SOCIETE_SUPPORT',
      error: 'Conflict',
    });
  });

  // ── Contre-épreuves : le filtre Sentry n'a rien perdu ─────────────────────

  it('CONTRE-ÉPREUVE : une vraie erreur serveur sort toujours en 500', async () => {
    // Sans elle, un filtre qui traduirait tout en 403 passerait les tests
    // ci-dessus tout en masquant les incidents réels.
    erreurLevee = new Error('base de données injoignable');

    const reponse = await request(app.getHttpServer())
      .post('/investments')
      .send({ projetId: 'projet-1', nbFractions: 1 });

    expect(reponse.status).toBe(500);
    expect(reponse.body.code).toBeUndefined();
  });

  it('CONTRE-ÉPREUVE Sentry : la 500 part vers Sentry, le refus 403 n’y va pas', async () => {
    erreurLevee = new Error('base de données injoignable');
    await request(app.getHttpServer())
      .post('/investments')
      .send({ projetId: 'projet-1', nbFractions: 1 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    // Un porteur qui tente sa propre collecte n'est pas un incident serveur :
    // son refus est traité par le filtre métier et n'atteint jamais Sentry.
    (Sentry.captureException as jest.Mock).mockClear();
    erreurLevee = new PorteurDeSonPropreProjetError('Vous portez ce projet.');
    await request(app.getHttpServer())
      .post('/investments')
      .send({ projetId: 'projet-1', nbFractions: 1 });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
