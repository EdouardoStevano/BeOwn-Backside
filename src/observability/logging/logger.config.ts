import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';
import { trace } from '@opentelemetry/api';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Configuration nestjs-pino : logs JSON structurés, corrélés au traceId, avec
 * redaction RGPD.
 *
 * - `level` piloté par `LOG_LEVEL` (info par défaut).
 * - `mixin` : injecte `traceId`/`spanId` du span OTel actif dans CHAQUE log →
 *   corrélation directe Loki ↔ Tempo (on saute d'une ligne de log à la trace).
 * - `genReqId` : réutilise/propage `x-request-id` pour suivre une requête de
 *   bout en bout.
 * - `redact` : masque les champs sensibles (RGPD — plateforme PSFP régulée).
 *   AUCUNE PII ne doit atterrir dans Loki. La liste couvre l'en-tête
 *   Authorization, les cookies, et les champs métier (email, iban,
 *   ibanDestination, password, token/refreshToken, numeroDocument KYC, nom,
 *   prenom, téléphone, adresse postale, date/lieu de naissance, nationalité,
 *   patrimoine déclaré) au niveau racine, en wildcard un-niveau, et dans
 *   `req.body`. Liste alignée sur l'inventaire PII KYC/AML (OBS-3,
 *   AUDIT_SECURITE_2026-08-01.md).
 * - `autoLogging.ignore` : ne journalise pas les sondes /health* ni le scrape
 *   /metrics (bruit des probes k8s et d'Alloy).
 *
 * ⚠ NE PAS confondre avec l'AuditLog réglementaire (PII assumée, stockée en
 * base, JAMAIS exportée vers Loki).
 *
 * OBS-2 (AUDIT_SECURITE_2026-08-01.md) : des routes comme `GET /email/verify
 * ?token=…` ou le reset password portent un secret single-use EN QUERY
 * STRING. Le serializer `req` ci-dessous retire donc systématiquement la
 * query string de `url` avant journalisation — un secret ne doit jamais
 * transiter par la télémétrie, même à usage unique et TTL court.
 */

/** Retire la query string d'un chemin (`/email/verify?token=x` -> `/email/verify`). */
function stripQueryString(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

const REDACT_PATHS = [
  // En-têtes de transport
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  // Champs métier — racine + un niveau d'imbrication
  'password',
  '*.password',
  'email',
  '*.email',
  'iban',
  '*.iban',
  'ibanDestination',
  '*.ibanDestination',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'numeroDocument',
  '*.numeroDocument',
  'nom',
  '*.nom',
  'prenom',
  '*.prenom',
  // Inventaire PII KYC/AML (OBS-3) — non couvert par la liste initiale.
  'telephone',
  '*.telephone',
  'phone',
  '*.phone',
  'adresse',
  '*.adresse',
  'ville',
  '*.ville',
  'codePostal',
  '*.codePostal',
  'dateNaissance',
  '*.dateNaissance',
  'lieuNaissance',
  '*.lieuNaissance',
  'nationalite',
  '*.nationalite',
  'patrimoineDeclare',
  '*.patrimoineDeclare',
  // Corps de requête (pino-http peut le sérialiser selon la config appelante)
  'req.body.password',
  'req.body.email',
  'req.body.iban',
  'req.body.ibanDestination',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.numeroDocument',
  'req.body.nom',
  'req.body.prenom',
  'req.body.telephone',
  'req.body.phone',
  'req.body.adresse',
  'req.body.ville',
  'req.body.codePostal',
  'req.body.dateNaissance',
  'req.body.lieuNaissance',
  'req.body.nationalite',
  'req.body.patrimoineDeclare',
];

const IGNORED_PREFIXES = ['/health', '/metrics'];

export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',

    genReqId(req: IncomingMessage, res: ServerResponse): string {
      const header = req.headers['x-request-id'];
      const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    mixin() {
      const span = trace.getActiveSpan();
      if (!span) return {};
      const ctx = span.spanContext();
      return { traceId: ctx.traceId, spanId: ctx.spanId };
    },

    redact: {
      paths: REDACT_PATHS,
      censor: '[redacted]',
    },

    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? '';
        return IGNORED_PREFIXES.some((p) => url.startsWith(p));
      },
    },

    // Sérialiseurs minimaux : jamais le corps complet ni tous les headers.
    serializers: {
      req(req: { id: unknown; method: string; url: string }) {
        return { id: req.id, method: req.method, url: stripQueryString(req.url) };
      },
      res(res: { statusCode: number }) {
        return { statusCode: res.statusCode };
      },
    },
  },
};
