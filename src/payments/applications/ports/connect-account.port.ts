/**
 * Port de LECTURE du compte Stripe Connect de retrait (ISP : lecture seule).
 *
 * Extrait de `StripeConnectService` pour que les cas d'usage qui n'ont besoin
 * que du statut du compte connecté (gestion des destinations de retrait,
 * consultation du solde instantané) ne dépendent pas du SDK Stripe et restent
 * testables sans réseau.
 *
 * Le type `ConnectAccountStatus` est déclaré ICI (couche application) et
 * ré-exporté par l'adaptateur d'infrastructure : les importeurs historiques
 * (`payment.controller.ts`, `request-retrait.usecase.ts`) ne changent pas.
 */
export interface ConnectAccountStatus {
  connected: boolean;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export abstract class ConnectAccountReader {
  /** Statut live du compte connecté de l'investisseur (accountId null si absent). */
  abstract getAccountStatus(userId: number): Promise<ConnectAccountStatus>;
}
