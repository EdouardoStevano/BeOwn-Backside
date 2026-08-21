import type { MetricName } from './metric-names';

/**
 * PORT de métriques (DIP + ISP).
 *
 * Le domaine et l'application dépendent de CETTE abstraction, jamais de
 * prom-client. L'adaptateur d'infrastructure (`PrometheusMetricsAdapter`) est
 * la seule implémentation qui importe prom-client. Aucune couche métier ne doit
 * importer `prom-client`, `@opentelemetry/*` ni `@sentry/*`.
 *
 * Interface volontairement minimale (ISP) : trois primitives suffisent à
 * couvrir tous les besoins (compteurs, histogrammes, jauges). Les noms de
 * métriques et les buckets sont centralisés dans `metric-names.ts` — un appelant
 * ne manipule jamais de configuration prom-client.
 *
 * `abstract class` (et non `interface` TS) pour servir À LA FOIS d'abstraction
 * et de token d'injection Nest : `@Inject(MetricsPort)` côté consommateur,
 * `{ provide: MetricsPort, useClass: PrometheusMetricsAdapter }` côté module.
 *
 * Contrat de robustesse : une implémentation NE DOIT JAMAIS lever d'exception
 * ni bloquer sur un chemin appelant. L'observabilité n'a pas le droit de casser
 * un chemin argent — un nom inconnu, un labelset invalide ou une panne interne
 * se résolvent en no-op journalisé.
 *
 * Les labels doivent rester bornés et sans PII (voir metric-names.ts).
 */
export abstract class MetricsPort {
  /**
   * Incrémente un compteur. `value` par défaut 1.
   * `labels` : uniquement des valeurs bornées (statut, type, outcome…).
   */
  abstract incrementCounter(
    name: MetricName,
    labels?: Record<string, string>,
    value?: number,
  ): void;

  /** Enregistre une observation dans un histogramme (montant EUR, durée s…). */
  abstract observeHistogram(
    name: MetricName,
    value: number,
    labels?: Record<string, string>,
  ): void;

  /** Fixe la valeur courante d'une jauge (solde, backlog, timestamp…). */
  abstract setGauge(
    name: MetricName,
    value: number,
    labels?: Record<string, string>,
  ): void;
}
