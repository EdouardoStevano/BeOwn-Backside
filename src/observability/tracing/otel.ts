/**
 * Initialisation OpenTelemetry (traces distribuées) — export OTLP/HTTP vers
 * Grafana Alloy in-cluster, qui relaie vers Grafana Cloud Tempo (région UE).
 *
 * ⚠ ORDRE D'IMPORT CRITIQUE : ce fichier DOIT être importé EN TOUT PREMIER dans
 * main.ts, AVANT `import { AppModule }` et donc avant que `http`, `express`,
 * `pg` et `ioredis` ne soient chargés. Les auto-instrumentations monkey-patchent
 * ces modules au `require` ; si NestFactory/AppModule sont importés avant, les
 * modules cibles sont déjà résolus et NE SERONT PAS instrumentés (traces vides).
 *
 * Effet de bord à l'import : démarre le NodeSDK uniquement si
 * `OTEL_EXPORTER_OTLP_ENDPOINT` est défini. En développement sans collecteur,
 * l'absence de variable = pas de tracing (aucune erreur, aucun bruit).
 *
 * Aucune donnée métier ici : les traces ne portent que des attributs techniques
 * (méthode HTTP, route, requête SQL paramétrée). La redaction de PII est gérée
 * côté logs (pino) ; ne jamais ajouter d'attribut de span contenant email/IBAN/
 * token/numéro de document.
 *
 * OBS-2 (AUDIT_SECURITE_2026-08-01.md) : l'instrumentation HTTP auto capture
 * `http.target`/`url.full` QUERY STRING COMPRISE — des routes comme
 * `GET /email/verify?token=…` enverraient donc un secret single-use vers
 * Tempo. Le `requestHook` ci-dessous réécrit ces attributs pour ne garder
 * que le chemin, avant l'export.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import type { Span } from '@opentelemetry/api';
import type { IncomingMessage, ClientRequest } from 'http';

/** Retire la query string d'un chemin (`/email/verify?token=x` -> `/email/verify`). */
function stripQueryString(pathOrUrl: string): string {
  const i = pathOrUrl.indexOf('?');
  return i === -1 ? pathOrUrl : pathOrUrl.slice(0, i);
}

/**
 * Réécrit les attributs d'URL du span pour retirer toute query string, quelle
 * que soit la version de la convention sémantique utilisée par
 * l'instrumentation HTTP installée (`http.target`/`http.url` legacy,
 * `url.path`/`url.full`/`url.query` stable).
 */
function redactSpanUrl(span: Span, request: IncomingMessage | ClientRequest): void {
  const rawPath =
    'url' in request && typeof request.url === 'string'
      ? request.url
      : 'path' in request && typeof request.path === 'string'
        ? request.path
        : undefined;
  if (rawPath === undefined) return;
  const stripped = stripQueryString(rawPath);
  span.setAttribute('http.target', stripped);
  span.setAttribute('http.url', stripped);
  span.setAttribute('url.path', stripped);
  span.setAttribute('url.full', stripped);
  span.setAttribute('url.query', '');
}

let sdk: NodeSDK | undefined;

export function initTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // Pas de collecteur configuré → tracing désactivé (dev/CI). Silencieux.
    return;
  }
  if (sdk) return; // idempotent

  const traceExporter = new OTLPTraceExporter({
    // Convention OTLP/HTTP : le endpoint racine + le chemin standard des traces.
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'beown-api',
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? '1.0.0',
      // Corrèle les traces à l'environnement (dev/staging/production) côté Tempo.
      'deployment.environment':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT ??
        process.env.NODE_ENV ??
        'development',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Le bruit du système de fichiers noierait les traces utiles.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // OBS-2 : purge la query string des attributs d'URL (entrants ET
        // sortants — un secret peut aussi transiter dans un appel sortant).
        '@opentelemetry/instrumentation-http': {
          requestHook: redactSpanUrl,
        },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    sdk
      ?.shutdown()
      .catch((err) => console.error('OTel shutdown error:', err))
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

// Démarrage immédiat à l'import (voir l'avertissement d'ordre ci-dessus).
initTracing();
