export const EXCHANGE_RATE_PROVIDER = Symbol('EXCHANGE_RATE_PROVIDER');

/**
 * Source des taux de change, vue par l'application.
 *
 * Contrat volontairement minuscule (ISP) : « donne-moi les taux depuis l'euro,
 * ou dis-moi que tu n'as rien ». Ni clé d'API, ni URL, ni forme de charge
 * utile — ce sont des détails du fournisseur, qui vivent dans l'adapter. C'est
 * ce qui permet à `ExchangeRatesService` d'être testé sans réseau, et de
 * changer de fournisseur sans toucher au cache ni au contrat HTTP.
 *
 * `null` signifie « indisponible » (clé absente, panne, délai dépassé,
 * réponse inexploitable) : jamais une exception, parce que l'appelant a un
 * comportement défini pour ce cas et qu'une source de confort ne doit pas se
 * propager en erreur.
 */
export interface ExchangeRateProvider {
  lireTauxDepuisEuro(): Promise<Record<string, number> | null>;
}
