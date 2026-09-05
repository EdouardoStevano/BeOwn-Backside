import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';
import pino from 'pino';
import type { DestinationStream } from 'pino';
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

/**
 * Rend une destination de logs INCAPABLE de tuer le processus (finding A2).
 *
 * Constat en charge : sous saturation, le service mourait sur un
 * `Error: UNKNOWN: unknown error, write` remonté par SonicBoom — le flux de
 * sortie de pino. Vérifié dans pino 10.3.1 (`lib/tools.js`,
 * `buildSafeSonicBoom`) : le seul gestionnaire d'erreur posé par défaut,
 * `filterBrokenPipe`, traite EPIPE puis **se retire et ré-émet** toute autre
 * erreur. Sans autre écouteur, un 'error' ré-émis sur un EventEmitter est une
 * exception non gérée : le process meurt.
 *
 * Un échec d'ÉCRITURE DE LOG ne doit jamais interrompre un service. On pose
 * donc un écouteur permanent : la première erreur est signalée sur stderr (si
 * stderr veut bien l'accepter), les suivantes sont avalées pour ne pas
 * transformer une panne d'écriture en boucle de bruit. Les lignes de log
 * concernées sont perdues — c'est le coût assumé, et il est très inférieur à
 * l'arrêt du pod.
 */
export function protegerDestinationLogs<
  T extends { on(evenement: 'error', ecouteur: (err: Error) => void): unknown },
>(destination: T): T {
  let dejaSignale = false;
  destination.on('error', (err: Error) => {
    if (dejaSignale) return;
    dejaSignale = true;
    try {
      process.stderr.write(
        `[logger] écriture des logs en échec, journalisation dégradée : ${err?.message ?? err}\n`,
      );
    } catch {
      // stderr est cassé lui aussi : il ne reste rien à faire, surtout pas
      // relancer une erreur depuis un gestionnaire d'erreur.
    }
  });
  return destination;
}

/**
 * Destination des logs : même flux que le défaut de pino (descripteur 1,
 * SonicBoom asynchrone), à ceci près qu'elle est explicitement construite ici
 * pour qu'on puisse y brancher le garde ci-dessus.
 */
export const logDestination: DestinationStream = protegerDestinationLogs(
  pino.destination({ dest: process.stdout.fd ?? 1 }),
);

export const loggerConfig: Params = {
  // Forme [options, flux] : c'est la seule qui permette de fournir NOTRE
  // destination — celle dont l'événement 'error' est géré (cf. A2 ci-dessus).
  pinoHttp: [
    {
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
          return {
            id: req.id,
            method: req.method,
            url: stripQueryString(req.url),
          };
        },
        res(res: { statusCode: number }) {
          return { statusCode: res.statusCode };
        },
      },
    },
    logDestination,
  ],
};
