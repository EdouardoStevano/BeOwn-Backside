import type { EcheanceNaissante } from '../entities/echeance';
import { RemboursementMode } from '../enums/investment-status.enum';
import { EchelonnementImpossibleError } from '../errors/subscription.errors';
import type { Investment } from '../aggregates/investment';
import type { ProjetSouscriptible } from '../value-objects/projet-souscriptible';
import {
  strategieDeRemboursement,
  type EchelonnementDemande,
} from './coupon-calculation.strategy';

/**
 * **Génération de l'échéancier** (§9) — la logique n'appartient ni à
 * `Investment` (elle a besoin des conditions du projet : TRI et durée) ni à
 * `Echeance` (elle en produit une série cohérente, pas une seule) : c'est un
 * Domain Service.
 *
 * Il remplace deux méthodes privées `generateEcheances` **identiques au
 * caractère près**, recopiées dans `CreateInvestmentUseCase` et
 * `TopUpInvestmentUseCase` — quarante lignes de calcul financier dupliquées
 * dans la couche application, qu'aucun test ne couvrait directement.
 *
 * Le service valide ce qui rendrait un échéancier absurde, puis délègue la
 * ventilation capital / intérêts à la stratégie du mode de remboursement
 * (§38.1). Les montants produits sont, à l'arrondi près, ceux des méthodes
 * remplacées : le refactoring ne redéfinit aucun coupon existant.
 */
export class EcheancierGenerator {
  /**
   * L'échéancier d'un investissement, aux conditions financières de son projet.
   * `origine` ancre le calendrier : la première échéance tombe un mois après.
   */
  static generer(
    investment: Investment,
    projet: Pick<ProjetSouscriptible, 'triCible' | 'dureeMois'>,
    mode: RemboursementMode = RemboursementMode.IN_FINE,
    origine: Date = new Date(),
  ): EcheanceNaissante[] {
    return EcheancierGenerator.genererPour(
      {
        investissementId: investment.id,
        montant: investment.montant,
        triAnnuel: projet.triCible,
        dureeMois: projet.dureeMois,
        origine,
      },
      mode,
    );
  }

  /** La même génération, à partir de la demande brute. */
  static genererPour(
    demande: EchelonnementDemande,
    mode: RemboursementMode = RemboursementMode.IN_FINE,
  ): EcheanceNaissante[] {
    if (!Number.isFinite(demande.montant) || demande.montant <= 0) {
      throw new EchelonnementImpossibleError(
        'le capital souscrit est nul ou négatif',
        {
          montant: demande.montant,
        },
      );
    }
    if (!Number.isInteger(demande.dureeMois) || demande.dureeMois < 1) {
      throw new EchelonnementImpossibleError(
        "la durée du projet n'est pas un nombre de mois valide",
        {
          dureeMois: demande.dureeMois,
        },
      );
    }

    return strategieDeRemboursement(mode).calculer(demande);
  }
}
