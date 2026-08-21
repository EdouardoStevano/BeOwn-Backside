/**
 * Catalogue central des noms de métriques et de leurs paramètres.
 *
 * Pourquoi un fichier de constantes plutôt que des chaînes en dur au point
 * d'émission :
 *  - une faute de frappe dans un nom = une série silencieusement absente des
 *    dashboards/alertes ; ici le compilateur attrape l'erreur ;
 *  - les buckets d'histogrammes et les libellés de labels bornés (faible
 *    cardinalité, sans PII) sont définis UNE fois et réutilisés à l'émission
 *    comme à la déclaration prom-client, garantissant leur cohérence.
 *
 * ⚠ RGPD / cardinalité : les VALEURS de labels doivent toujours être bornées
 * (route template, statut, type, outcome…). JAMAIS d'email, d'userId, de
 * `pi_xxx`, d'IBAN ni de montant en label — ces informations restent dans les
 * logs/traces. Voir MONITORING.md.
 */

export const METRIC = {
  // ─── RED HTTP ────────────────────────────────────────────────────────────
  HTTP_REQUESTS_TOTAL: 'beown_http_requests_total',
  HTTP_REQUEST_DURATION_SECONDS: 'beown_http_request_duration_seconds',

  // ─── Dépôts ──────────────────────────────────────────────────────────────
  DEPOSITS_TOTAL: 'beown_deposits_total',
  DEPOSIT_AMOUNT_EUR: 'beown_deposit_amount_eur',
  DEPOSIT_REJECTED_TOTAL: 'beown_deposit_rejected_total',

  // ─── Retraits ────────────────────────────────────────────────────────────
  WITHDRAWAL_REQUESTS_TOTAL: 'beown_withdrawal_requests_total',
  WITHDRAWAL_AMOUNT_EUR: 'beown_withdrawal_amount_eur',
  WITHDRAWAL_TRANSFER_FAILED_TOTAL: 'beown_withdrawal_transfer_failed_total',
  WITHDRAWAL_PAYOUT_TOTAL: 'beown_withdrawal_payout_total',
  WITHDRAWAL_RECREDITED_TOTAL: 'beown_withdrawal_recredited_total',
  CONNECT_ONBOARDING_TOTAL: 'beown_connect_onboarding_total',

  // ─── Marché secondaire ───────────────────────────────────────────────────
  SECONDARY_ORDERS_TOTAL: 'beown_secondary_orders_total',
  SECONDARY_ORDER_AMOUNT_EUR: 'beown_secondary_order_amount_eur',
  SECONDARY_EXECUTION_FAILED_TOTAL: 'beown_secondary_execution_failed_total',
  SECONDARY_FEES_EUR: 'beown_secondary_fees_eur',

  // ─── Investissements / collecte / échéances ──────────────────────────────
  INVESTMENT_CREATED_TOTAL: 'beown_investment_created_total',
  INVESTMENT_AMOUNT_EUR: 'beown_investment_amount_eur',
  INVESTMENT_PSFP_CAP_BLOCKED_TOTAL: 'beown_investment_psfp_cap_blocked_total',
  COLLECTE_CLOSED_TOTAL: 'beown_collecte_closed_total',
  COLLECTE_REFUND_AMOUNT_EUR: 'beown_collecte_refund_amount_eur',
  ECHEANCE_SETTLEMENTS_TOTAL: 'beown_echeance_settlements_total',
  ECHEANCE_SETTLEMENT_AMOUNT_EUR: 'beown_echeance_settlement_amount_eur',
  ECHEANCE_AUTOPAY_FAILED_TOTAL: 'beown_echeance_autopay_failed_total',
  ECHEANCE_OVERDUE_TRANSITIONS_TOTAL: 'beown_echeance_overdue_transitions_total',
  ECHEANCES_DUE_UNVERIFIED: 'beown_echeances_due_unverified',

  // ─── Distributions (equity / locatif) ────────────────────────────────────
  DISTRIBUTION_PARTS_TOTAL: 'beown_distribution_parts_total',
  DISTRIBUTION_AMOUNT_EUR: 'beown_distribution_amount_eur',

  // ─── KYC ─────────────────────────────────────────────────────────────────
  KYC_TRANSITIONS_TOTAL: 'beown_kyc_transitions_total',
  KYC_REVIEW_DURATION_SECONDS: 'beown_kyc_review_duration_seconds',
  KYC_MANUAL_REVIEW_PENDING: 'beown_kyc_manual_review_pending',
  KYC_WEBHOOK_IGNORED_TOTAL: 'beown_kyc_webhook_ignored_total',

  // ─── Sécurité ────────────────────────────────────────────────────────────
  WEBHOOK_SIGNATURE_INVALID_TOTAL: 'beown_webhook_signature_invalid_total',
  THROTTLE_BLOCKED_TOTAL: 'beown_throttle_blocked_total',
  SIGNIN_TOTAL: 'beown_signin_total',
  AML_THRESHOLD_EXCEEDED_TOTAL: 'beown_aml_threshold_exceeded_total',

  // ─── Réconciliation financière / intégrité ───────────────────────────────
  WALLET_LEDGER_DISCREPANCY_EUR: 'beown_wallet_ledger_discrepancy_eur',
  STRIPE_BALANCE_DISCREPANCY_EUR: 'beown_stripe_balance_discrepancy_eur',
  RECONCILIATION_LAST_SUCCESS_TIMESTAMP:
    'beown_reconciliation_last_success_timestamp',
  SEQUESTRE_BALANCE_EUR: 'beown_sequestre_balance_eur',

  // ─── Santé des dépendances (readiness) ───────────────────────────────────
  DEPENDENCY_UP: 'beown_dependency_up',
} as const;

export type MetricName = (typeof METRIC)[keyof typeof METRIC];

/**
 * Buckets d'histogrammes. Les montants EUR sont calibrés autour du ticket
 * moyen marché (~3700 EUR) ; la latence HTTP autour du SLO p95 < 800 ms.
 */
export const HISTOGRAM_BUCKETS = {
  DEPOSIT_EUR: [500, 1000, 2000, 3700, 5000, 10000, 25000, 50000, 100000],
  WITHDRAWAL_EUR: [500, 1000, 5000, 10000, 25000, 50000, 100000],
  SECONDARY_ORDER_EUR: [100, 500, 1000, 3700, 10000, 25000],
  SECONDARY_FEES_EUR: [1, 10, 50, 100, 250, 500, 1000, 5000],
  INVESTMENT_EUR: [500, 1000, 3700, 5000, 10000, 25000, 50000],
  ECHEANCE_EUR: [50, 100, 500, 1000, 3700, 10000, 25000],
  DISTRIBUTION_EUR: [50, 100, 500, 1000, 5000, 25000, 100000],
  REFUND_EUR: [1000, 5000, 25000, 100000, 500000],
  // 1h, 4h, 12h, 24h, 48h, 7j — backe le SLO réglementaire de revue KYC.
  KYC_REVIEW_SECONDS: [3600, 14400, 43200, 86400, 172800, 604800],
  HTTP_SECONDS: [0.05, 0.1, 0.25, 0.5, 0.8, 1, 2, 5],
} as const;
