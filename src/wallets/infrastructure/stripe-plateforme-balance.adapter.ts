import { Injectable } from '@nestjs/common';
import { StripePaymentService } from 'src/payments/infrastructure/stripe-payment.service';
import {
  PlateformeBalanceReader,
  SoldePlateforme,
} from '../applications/ports/plateforme-balance.port';

/**
 * Adaptateur Stripe du port {@link PlateformeBalanceReader}.
 *
 * SEUL fichier de la réconciliation qui connaît Stripe. Il ne CRÉE pas de
 * client : il réutilise celui de `StripePaymentService`, instancié une fois
 * pour tout le processus. Recréer une instance signifierait relire les clés
 * secrètes à un second endroit — donc un second endroit à sécuriser, à faire
 * tourner et à oublier lors d'une rotation.
 */
@Injectable()
export class StripePlateformeBalanceAdapter implements PlateformeBalanceReader {
  constructor(private readonly stripePayments: StripePaymentService) {}

  /**
   * Solde EUR du compte plateforme : `available` + `pending`.
   *
   * Les deux poches, et pas seulement `available`, parce que le contrôle porte
   * sur la COUVERTURE des portefeuilles investisseurs : un paiement encaissé
   * il y a deux jours mais encore en délai de disponibilité appartient déjà à
   * la plateforme et garantit déjà les soldes affichés. Ne compter que
   * `available` ferait clignoter un faux découvert chaque lundi matin, quand
   * les encaissements du week-end n'ont pas encore basculé.
   *
   * Filtrage sur `currency === 'eur'` : le compte peut porter d'autres devises
   * (résidus historiques, remboursements), qui ne couvrent pas des créances
   * libellées en euros et ne doivent donc pas être additionnées à l'aveugle.
   *
   * Conversion depuis les centimes : Stripe expose des entiers en plus petite
   * unité monétaire ; le grand livre interne, lui, raisonne en euros.
   */
  async lireSolde(): Promise<SoldePlateforme> {
    const balance = await this.stripePayments.client.balance.retrieve();

    const sommeEur = (entrees: any[] | undefined): number =>
      (entrees ?? [])
        .filter((entree) => entree?.currency === 'eur')
        .reduce((total, entree) => total + Number(entree.amount ?? 0), 0);

    // `connect_reserved` : fonds mis de côté par Stripe pour les comptes
    // connectés. Ils appartiennent toujours à la plateforme et garantissent
    // toujours les soldes affichés — les omettre creusait un faux découvert
    // exactement à hauteur de ce qui est en cours d'acheminement vers les
    // porteurs, c'est-à-dire au pire moment.
    const totalCentimes =
      sommeEur(balance?.available) +
      sommeEur(balance?.pending) +
      sommeEur((balance as { connect_reserved?: any[] })?.connect_reserved);

    return { totalEur: totalCentimes / 100, devise: 'EUR' };
  }
}
