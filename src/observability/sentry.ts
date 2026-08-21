/**
 * Initialisation Sentry (erreurs backend) — projet Sentry région UE.
 *
 * Init AUSSI TÔT que possible dans main.ts (après le tracing OTel). Le point
 * sensible d'une plateforme PSFP régulée est la PII : `beforeSend` scrub
 * agressivement TOUT champ sensible avant l'envoi (RGPD — aucune PII ne doit
 * quitter le cluster vers Sentry).
 *
 * Champs redactés (alignés sur la redaction pino) : authorization, cookie,
 * password, email, iban, ibanDestination, token, refreshToken, accessToken,
 * numeroDocument (KYC), nom, prenom, téléphone, adresse, ville, codePostal,
 * dateNaissance, lieuNaissance, nationalite, patrimoineDeclare (inventaire
 * PII KYC/AML — OBS-3). Scrub récursif sur tout l'événement (request.headers,
 * request.data, extra, contexts…). Les jetons front (`beown_token` /
 * `beown_refresh_token`) sont scrubbés côté fronts.
 *
 * OBS-3 (AUDIT_SECURITE_2026-08-01.md) : le scrub par clé ne protège pas un
 * message d'exception qui EMBARQUE la donnée en texte libre (ex.
 * `throw new Error('IBAN FR76… rejeté')`). `beforeSend` applique donc AUSSI
 * une passe regex (IBAN/email, en miroir du front `redactString`) sur
 * `event.message` et chaque `exception.values[].value`.
 *
 * Désactivé proprement si `SENTRY_DSN` absent (dev/CI) — aucune erreur.
 */
import * as Sentry from '@sentry/node';

/** Clés dont la valeur est toujours masquée (comparaison insensible à la casse). */
const SENSITIVE_KEYS = new Set(
  [
    'authorization',
    'cookie',
    'set-cookie',
    'password',
    'motdepasse',
    'email',
    'mail',
    'iban',
    'ibandestination',
    'token',
    'accesstoken',
    'refreshtoken',
    'refresh_token',
    'access_token',
    'jwt',
    'secret',
    'numerodocument',
    'nom',
    'prenom',
    // Inventaire PII KYC/AML (OBS-3) — non couvert par la liste initiale.
    'telephone',
    'phone',
    'adresse',
    'ville',
    'codepostal',
    'datenaissance',
    'lieunaissance',
    'nationalite',
    'patrimoinedeclare',
  ].map((k) => k.toLowerCase()),
);

const REDACTED = '[redacted]';

// IBAN (format ISO 13616) et adresses email — masqués où qu'ils apparaissent
// dans une chaîne libre (message d'exception non structuré).
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;

/** Masque IBAN/email dans une chaîne libre (message d'exception, log…). */
function scrubString(value: string): string {
  return value.replace(IBAN_RE, REDACTED).replace(EMAIL_RE, REDACTED);
}

/** Masque récursivement les valeurs des clés sensibles (profondeur bornée). */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase())
        ? REDACTED
        : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Échantillonnage des traces de perf Sentry (distinct des traces Tempo).
    // Bas par défaut pour ne pas doublonner Tempo ni exploser le quota.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Ne jamais joindre les IP/données perso par défaut.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) event.request = scrub(event.request) as typeof event.request;
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      if (event.user) {
        // On garde éventuellement un id technique, jamais email/nom.
        event.user = { id: event.user.id };
      }
      // OBS-3 : passe niveau-chaîne sur le message d'erreur libre (le scrub
      // par clé ci-dessus ne voit pas une PII embarquée dans du texte).
      if (event.message) event.message = scrubString(event.message);
      if (event.exception?.values) {
        for (const exceptionValue of event.exception.values) {
          if (exceptionValue.value) {
            exceptionValue.value = scrubString(exceptionValue.value);
          }
        }
      }
      return event;
    },
  });
}

export { Sentry };
