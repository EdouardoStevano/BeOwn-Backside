import { Injectable, Logger } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { MetricsPort } from './metrics.port';
import { HISTOGRAM_BUCKETS, METRIC, type MetricName } from './metric-names';

/**
 * Adaptateur d'infrastructure du `MetricsPort` basé sur prom-client
 * (SEUL fichier autorisé à importer prom-client, hors interceptor RED).
 *
 * - un `Registry` DÉDIÉ (pas le registre global) : isole nos séries, facilite
 *   les tests et évite les collisions si une lib tierce enregistre ses propres
 *   métriques ;
 * - `collectDefaultMetrics` : process/heap/eventloop/gc de Node — indispensable
 *   pour l'alerte mémoire pod et le diagnostic de saturation (HPA maxReplicas 6) ;
 * - toutes les métriques RED + métier de la spec sont déclarées ici À
 *   L'INITIALISATION, pour que les séries existent dès le démarrage (dashboards
 *   et règles d'alerte n'attendent pas le premier événement).
 *
 * Robustesse (contrat du port) : aucune méthode ne lève. Un nom inconnu ou un
 * labelset invalide est journalisé une fois puis ignoré — jamais propagé vers
 * un chemin argent.
 */
@Injectable()
export class PrometheusMetricsAdapter extends MetricsPort {
  private readonly logger = new Logger(PrometheusMetricsAdapter.name);
  readonly registry = new Registry();

  private readonly counters = new Map<string, Counter<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();
  private readonly gauges = new Map<string, Gauge<string>>();

  /** Évite d'inonder les logs si un nom mal orthographié est appelé en boucle. */
  private readonly warnedUnknown = new Set<string>();

  constructor() {
    super();
    this.registry.setDefaultLabels({ service: 'beown-api' });
    collectDefaultMetrics({ register: this.registry });
    this.declareMetrics();
  }

  incrementCounter(
    name: MetricName,
    labels: Record<string, string> = {},
    value = 1,
  ): void {
    try {
      const counter = this.counters.get(name);
      if (!counter) return this.warnUnknown(name, 'counter');
      counter.inc(labels, value);
    } catch (err) {
      this.warnEmit(name, err);
    }
  }

  observeHistogram(
    name: MetricName,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    try {
      const histogram = this.histograms.get(name);
      if (!histogram) return this.warnUnknown(name, 'histogram');
      histogram.observe(labels, value);
    } catch (err) {
      this.warnEmit(name, err);
    }
  }

  setGauge(
    name: MetricName,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    try {
      const gauge = this.gauges.get(name);
      if (!gauge) return this.warnUnknown(name, 'gauge');
      gauge.set(labels, value);
    } catch (err) {
      this.warnEmit(name, err);
    }
  }

  /** Exposition texte OpenMetrics pour le scrape Alloy (GET /metrics). */
  async scrape(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  // ─── Déclaration ───────────────────────────────────────────────────────────

  private counter(name: MetricName, help: string, labelNames: string[]): void {
    this.counters.set(
      name,
      new Counter({ name, help, labelNames, registers: [this.registry] }),
    );
  }

  private histogram(
    name: MetricName,
    help: string,
    labelNames: string[],
    buckets: readonly number[],
  ): void {
    this.histograms.set(
      name,
      new Histogram({
        name,
        help,
        labelNames,
        buckets: [...buckets],
        registers: [this.registry],
      }),
    );
  }

  private gauge(name: MetricName, help: string, labelNames: string[]): void {
    this.gauges.set(
      name,
      new Gauge({ name, help, labelNames, registers: [this.registry] }),
    );
  }

  private declareMetrics(): void {
    // ── RED HTTP ──────────────────────────────────────────────────────────
    this.counter(METRIC.HTTP_REQUESTS_TOTAL, 'Requêtes HTTP servies (RED).', [
      'method',
      'route',
      'status_class',
    ]);
    this.histogram(
      METRIC.HTTP_REQUEST_DURATION_SECONDS,
      'Latence des requêtes HTTP en secondes (RED).',
      ['method', 'route', 'status_class'],
      HISTOGRAM_BUCKETS.HTTP_SECONDS,
    );

    // ── Dépôts ────────────────────────────────────────────────────────────
    this.counter(
      METRIC.DEPOSITS_TOTAL,
      'Dépôts crédités sur le wallet investisseur.',
      ['source', 'outcome'],
    );
    this.histogram(
      METRIC.DEPOSIT_AMOUNT_EUR,
      'Montant des dépôts crédités (EUR).',
      ['source'],
      HISTOGRAM_BUCKETS.DEPOSIT_EUR,
    );
    this.counter(
      METRIC.DEPOSIT_REJECTED_TOTAL,
      'Dépôts refusés avant crédit (garde devise / BOLA).',
      ['reason', 'source'],
    );

    // ── Retraits ──────────────────────────────────────────────────────────
    this.counter(
      METRIC.WITHDRAWAL_REQUESTS_TOTAL,
      'Demandes de retrait investisseur.',
      ['method', 'result'],
    );
    this.histogram(
      METRIC.WITHDRAWAL_AMOUNT_EUR,
      'Montant des retraits ouverts (EUR).',
      ['method'],
      HISTOGRAM_BUCKETS.WITHDRAWAL_EUR,
    );
    this.counter(
      METRIC.WITHDRAWAL_TRANSFER_FAILED_TOTAL,
      'Échecs du Transfer Stripe (plateforme -> compte connecté).',
      [],
    );
    this.counter(
      METRIC.WITHDRAWAL_PAYOUT_TOTAL,
      'Issue du payout bancaire (webhook Stripe Connect).',
      ['outcome', 'reversal'],
    );
    this.counter(
      METRIC.WITHDRAWAL_RECREDITED_TOTAL,
      'Recrédits de retraits échoués.',
      ['trigger'],
    );
    this.counter(
      METRIC.CONNECT_ONBOARDING_TOTAL,
      'Parcours onboarding compte de retrait Stripe Connect Express.',
      ['event'],
    );

    // ── Marché secondaire ─────────────────────────────────────────────────
    this.counter(
      METRIC.SECONDARY_ORDERS_TOTAL,
      'Cycle de vie des ordres du marché secondaire.',
      ['action'],
    );
    this.histogram(
      METRIC.SECONDARY_ORDER_AMOUNT_EUR,
      'Montant des ordres du marché secondaire (EUR).',
      ['action'],
      HISTOGRAM_BUCKETS.SECONDARY_ORDER_EUR,
    );
    this.counter(
      METRIC.SECONDARY_EXECUTION_FAILED_TOTAL,
      "Échecs d'exécution d'un ordre secondaire.",
      ['reason'],
    );
    this.histogram(
      METRIC.SECONDARY_FEES_EUR,
      'Frais plateforme encaissés sur une revente secondaire (EUR).',
      ['source'],
      HISTOGRAM_BUCKETS.SECONDARY_FEES_EUR,
    );

    // ── Investissements / collecte / échéances ────────────────────────────
    this.counter(
      METRIC.INVESTMENT_CREATED_TOTAL,
      'Souscriptions confirmées (obligations/parts).',
      ['flow'],
    );
    this.histogram(
      METRIC.INVESTMENT_AMOUNT_EUR,
      'Montant investi par souscription confirmée (EUR).',
      ['flow'],
      HISTOGRAM_BUCKETS.INVESTMENT_EUR,
    );
    this.counter(
      METRIC.INVESTMENT_PSFP_CAP_BLOCKED_TOTAL,
      'Souscription bloquée par le plafond PSFP investisseur non-averti.',
      ['reason'],
    );
    this.counter(
      METRIC.COLLECTE_CLOSED_TOTAL,
      'Clôture de collecte (règle tout-ou-rien PSFP).',
      ['outcome'],
    );
    this.histogram(
      METRIC.COLLECTE_REFUND_AMOUNT_EUR,
      'Montant total recrédité aux investisseurs (remboursement de collecte, EUR).',
      ['trigger'],
      HISTOGRAM_BUCKETS.REFUND_EUR,
    );
    this.counter(
      METRIC.ECHEANCE_SETTLEMENTS_TOTAL,
      'Échéances obligataires réglées (coupon + capital, PFU prélevé).',
      ['source'],
    );
    this.histogram(
      METRIC.ECHEANCE_SETTLEMENT_AMOUNT_EUR,
      "Ventilation brut/net d'un règlement d'échéance (EUR).",
      ['component'],
      HISTOGRAM_BUCKETS.ECHEANCE_EUR,
    );
    this.counter(
      METRIC.ECHEANCE_AUTOPAY_FAILED_TOTAL,
      "Échéances dues dont l'auto-paiement CRON a échoué.",
      [],
    );
    this.counter(
      METRIC.ECHEANCE_OVERDUE_TRANSITIONS_TOTAL,
      'Échéances basculées A_VENIR -> RETARD par le CRON.',
      [],
    );
    this.gauge(
      METRIC.ECHEANCES_DUE_UNVERIFIED,
      "Échéances dues aujourd'hui mais encore A_VENIR (non payées).",
      [],
    );

    // ── Distributions ─────────────────────────────────────────────────────
    this.counter(
      METRIC.DISTRIBUTION_PARTS_TOTAL,
      "Parts d'une période de distribution equity/locatif.",
      ['outcome'],
    );
    this.histogram(
      METRIC.DISTRIBUTION_AMOUNT_EUR,
      "Montants d'une période de distribution equity (EUR).",
      ['component'],
      HISTOGRAM_BUCKETS.DISTRIBUTION_EUR,
    );

    // ── KYC ───────────────────────────────────────────────────────────────
    this.counter(
      METRIC.KYC_TRANSITIONS_TOTAL,
      'Transitions du funnel KYC (Stripe Identity + revue manuelle).',
      ['to_status', 'mode'],
    );
    this.histogram(
      METRIC.KYC_REVIEW_DURATION_SECONDS,
      'Durée entre entrée en revue manuelle et décision admin (s).',
      ['decision'],
      HISTOGRAM_BUCKETS.KYC_REVIEW_SECONDS,
    );
    this.gauge(
      METRIC.KYC_MANUAL_REVIEW_PENDING,
      'Backlog de dossiers KYC EN_REVUE en attente de décision.',
      [],
    );
    this.counter(
      METRIC.KYC_WEBHOOK_IGNORED_TOTAL,
      'Events Stripe Identity ignorés (transition non autorisée).',
      ['event'],
    );

    // ── Sécurité ──────────────────────────────────────────────────────────
    this.counter(
      METRIC.WEBHOOK_SIGNATURE_INVALID_TOTAL,
      'Webhooks rejetés pour signature HMAC invalide.',
      ['provider'],
    );
    this.counter(
      METRIC.THROTTLE_BLOCKED_TOTAL,
      'Épisodes de blocage par le rate-limiter Redis.',
      ['throttler'],
    );
    this.counter(
      METRIC.SIGNIN_TOTAL,
      'Tentatives de connexion email/mot de passe.',
      ['outcome', 'reason'],
    );
    this.counter(
      METRIC.AML_THRESHOLD_EXCEEDED_TOTAL,
      'Alertes LCB-FT (AML) sur dépassement de seuil.',
      ['context', 'rule'],
    );

    // ── Réconciliation financière / intégrité ─────────────────────────────
    this.gauge(
      METRIC.WALLET_LEDGER_DISCREPANCY_EUR,
      'Écart absolu SUM(wallets.solde) vs solde reconstruit depuis le ledger (EUR).',
      [],
    );
    this.gauge(
      METRIC.STRIPE_BALANCE_DISCREPANCY_EUR,
      'Écart solde Stripe attendu vs constaté (EUR).',
      [],
    );
    this.gauge(
      METRIC.RECONCILIATION_LAST_SUCCESS_TIMESTAMP,
      'Timestamp Unix du dernier succès de chaque job de réconciliation.',
      ['job'],
    );
    this.gauge(
      METRIC.SEQUESTRE_BALANCE_EUR,
      'Solde des wallets séquestres fiscaux (EUR).',
      ['type'],
    );

    // ── Santé des dépendances ─────────────────────────────────────────────
    this.gauge(
      METRIC.DEPENDENCY_UP,
      'État des dépendances critiques testé par la readiness (1=up, 0=down).',
      ['dependency'],
    );
  }

  private warnUnknown(name: string, kind: string): void {
    if (this.warnedUnknown.has(name)) return;
    this.warnedUnknown.add(name);
    this.logger.warn(
      `Métrique ${kind} inconnue "${name}" — émission ignorée (no-op). ` +
        'Vérifier le nom dans metric-names.ts et sa déclaration dans declareMetrics().',
    );
  }

  private warnEmit(name: string, err: unknown): void {
    this.logger.warn(
      `Émission de la métrique "${name}" échouée (ignorée) : ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
