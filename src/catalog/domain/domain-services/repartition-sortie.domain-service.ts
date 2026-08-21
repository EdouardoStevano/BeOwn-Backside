import { CapitalCibleInexploitableError } from '../errors/sortie.errors';
import { arrondirAuCentime } from '../value-objects/montant.vo';

/** Ce que la répartition a besoin de savoir d'un investissement. */
export interface PartInvestisseur {
  investissementId: string;
  utilisateurId: number;
  /** Capital souscrit, en devise du projet. */
  montant: number;
}

/** Ce qui revient à un investisseur, ligne à ligne. */
export interface QuotePartSortie {
  investissementId: string;
  utilisateurId: number;
  /** Retour de capital, 1:1, non imposable. */
  capitalRembourse: number;
  /** Quote-part de plus-value **nette** de frais. Négative en cas de moins-value. */
  plusValuePart: number;
  /** Impôt sur le revenu au titre de la plus-value immobilière. */
  impotRevenu: number;
  /** Prélèvements sociaux (CSG/CRDS). */
  prelevementsSociaux: number;
  /** Ce qui atterrit réellement sur le wallet investisseur. */
  netVerse: number;
}

export interface RepartitionSortie {
  quotesParts: QuotePartSortie[];
  totalCapitalRembourse: number;
  totalPlusValueDistribuee: number;
  totalImpotRevenu: number;
  totalPrelevementsSociaux: number;
}

/**
 * Comment se partage le produit d'une sortie entre les investisseurs.
 *
 * Pour chaque investisseur, au prorata de sa détention
 * (`montant / capitalCible`) :
 *
 * ```
 * capitalRembourse = montant                       (retour de capital, non imposable)
 * plusValuePart    = plusValueNette × détention    (négative si moins-value)
 * si plusValuePart > 0 :
 *     IR  = plusValuePart × 19,0 %                 (plus-value immobilière)
 *     CSG = plusValuePart × 17,2 %
 * netVerse = capitalRembourse + plusValuePart − IR − CSG
 * ```
 *
 * En moins-value, aucune fiscalité n'est prélevée et l'investisseur encaisse la
 * perte sur son capital.
 *
 * Ces quinze lignes d'arithmétique étaient enfouies au milieu de la boucle de
 * `ExecuteSortieUseCase`, entre deux `em.save(WalletEntity)` : impossible de
 * les éprouver sans simuler un `EntityManager`, une `DataSource` et deux
 * repositories TypeORM. Elles sont pures — elles ne dépendent que de nombres —
 * donc elles appartiennent au domaine, et s'y testent sans démarrer Nest (§11).
 *
 * Le use case garde ce qui n'est pas du calcul : ouvrir la transaction, créditer
 * les wallets, écrire le ledger, auditer.
 */
export class RepartitionSortieService {
  /** Taux d'imposition de la plus-value immobilière. */
  static readonly TAUX_IMPOT_REVENU = 0.19;

  /** Taux des prélèvements sociaux sur la plus-value. */
  static readonly TAUX_PRELEVEMENTS_SOCIAUX = 0.172;

  /**
   * @param plusValueDistribuable Plus-value brute **déjà nette** des frais de
   *   performance prélevés par la plateforme. Le taux de ces frais est une
   *   donnée de configuration, lue par le use case auprès de
   *   `PlatformFeesService` : le domaine reçoit le résultat, pas le barème.
   * @param capitalCible Base des quotes-parts. Doit être strictement positif —
   *   sans quoi la division est absurde et distribuerait n'importe quoi.
   */
  static repartir(
    parts: readonly PartInvestisseur[],
    plusValueDistribuable: number,
    capitalCible: number,
  ): RepartitionSortie {
    if (!Number.isFinite(capitalCible) || capitalCible <= 0) {
      throw new CapitalCibleInexploitableError();
    }

    const quotesParts = parts.map((part) => {
      const capitalRembourse = arrondirAuCentime(Number(part.montant));
      const detention = Number(part.montant) / capitalCible;
      const plusValuePart = arrondirAuCentime(
        plusValueDistribuable * detention,
      );

      const impotRevenu =
        plusValuePart > 0
          ? arrondirAuCentime(
              plusValuePart * RepartitionSortieService.TAUX_IMPOT_REVENU,
            )
          : 0;
      const prelevementsSociaux =
        plusValuePart > 0
          ? arrondirAuCentime(
              plusValuePart *
                RepartitionSortieService.TAUX_PRELEVEMENTS_SOCIAUX,
            )
          : 0;

      return {
        investissementId: part.investissementId,
        utilisateurId: part.utilisateurId,
        capitalRembourse,
        plusValuePart,
        impotRevenu,
        prelevementsSociaux,
        netVerse: arrondirAuCentime(
          capitalRembourse + plusValuePart - impotRevenu - prelevementsSociaux,
        ),
      };
    });

    const somme = (extraire: (q: QuotePartSortie) => number) =>
      arrondirAuCentime(quotesParts.reduce((t, q) => t + extraire(q), 0));

    return {
      quotesParts,
      totalCapitalRembourse: somme((q) => q.capitalRembourse),
      totalPlusValueDistribuee: somme((q) => q.plusValuePart),
      totalImpotRevenu: somme((q) => q.impotRevenu),
      totalPrelevementsSociaux: somme((q) => q.prelevementsSociaux),
    };
  }
}
