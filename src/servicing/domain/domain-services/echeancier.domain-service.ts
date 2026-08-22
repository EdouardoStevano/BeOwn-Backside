import type { EcheanceNaissante } from '../entities/echeance';
import { RemboursementMode } from '../enums/echeance.enum';
import { EchelonnementImpossibleError } from '../errors';
import {
  strategieDeRemboursement,
  type EchelonnementDemande,
} from './coupon-calculation.strategy';

/**
 * **Génération de l'échéancier** (§9) — la logique n'appartient ni à
 * l'investissement (elle a besoin des conditions du projet : TRI et durée) ni à
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
 * (§38.1).
 *
 * **Il ne reçoit pas d'agrégat, seulement une demande.** Il prenait un
 * `Investment` et un `ProjetSouscriptible` — deux modèles de `subscription` et
 * de `catalog` importés dans le domaine d'un troisième contexte (§3). Ce dont un
 * échéancier a besoin, ce sont quatre nombres et une date : `subscription` les
 * extrait de son agrégat et les passe, c'est là son rôle d'amont (§3.4).
 */
export class EcheancierGenerator {
  /**
   * L'échéancier correspondant à une demande, aux conditions financières du
   * projet. `origine` ancre le calendrier : la première échéance tombe un mois
   * après.
   */
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
