import { StatutSortie } from '../enums/statut-sortie.enum';
import { ChampSortieInvalideError } from '../errors/sortie.errors';
import { SortieProjet } from '../sortie-projet';
import { arrondirAuCentime } from '../value-objects/montant.vo';

/** Ce qu'il faut pour déclarer une sortie. Le reste est décidé ici. */
export interface DeclarerSortieProps {
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  /** Capital collecté sur le projet, base de calcul de la plus-value. */
  capitalCible: number;
  /** Fourni si l'acte est déjà signé — la sortie naît alors `ACTEE`. */
  acteVentePdfUrl?: string | null;
}

/**
 * Déclaration d'une sortie de projet.
 *
 * Ce que la fabrique décide, et qu'aucun appelant ne peut donc contredire :
 *
 * - la **plus-value brute**, `prixRevente − capitalCible`. C'est l'invariant
 *   central de la sortie : elle commande tout ce que la distribution verse, et
 *   la laisser déclarable permettrait de distribuer une plus-value sans rapport
 *   avec le prix de vente. Le calcul vivait dans `DeclareSortieUseCase`, à côté
 *   d'un `round2` privé ;
 * - le **statut de départ**, déduit de la présence d'un acte de vente : `ACTEE`
 *   si l'acte accompagne la déclaration, `PROJETEE` sinon. La règle est un
 *   fait — une vente sans acte n'est pas actée — pas un choix d'appelant.
 */
export class SortieProjetFactory {
  static declarer(props: DeclarerSortieProps): SortieProjet {
    const prixRevente = Number(props.prixRevente);
    if (!Number.isFinite(prixRevente) || prixRevente <= 0) {
      throw new ChampSortieInvalideError(
        'prixRevente',
        'le prix de revente doit être positif.',
      );
    }
    if (Number.isNaN(props.dateRevente?.getTime())) {
      throw new ChampSortieInvalideError('dateRevente', 'date illisible.');
    }

    const acteVentePdfUrl = props.acteVentePdfUrl?.trim() || null;

    return new SortieProjet({
      // Attribués par la persistance — l'`id` est un uuid généré en base.
      id: undefined as unknown as string,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
      projetId: props.projetId,
      prixRevente: arrondirAuCentime(prixRevente),
      dateRevente: props.dateRevente,
      plusValueBrute: arrondirAuCentime(
        prixRevente - Number(props.capitalCible),
      ),
      statut: acteVentePdfUrl ? StatutSortie.ACTEE : StatutSortie.PROJETEE,
      acteVentePdfUrl,
    });
  }
}
