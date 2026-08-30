import { Pourcentage } from './pourcentage.vo';

/**
 * Les taux tels que la table les range, et tels que l'API publique les publie.
 *
 * Les clés sont inchangées : `GET /public/platform-fees` sert le même JSON, et
 * l'écran d'administration écrit dans les mêmes champs.
 */
export interface BaremeDesFraisSnapshot {
  /**
   * @deprecated Plus aucun calcul ne l'utilise : il servait à la gestion
   * locative, sortie du périmètre (§1.4.3). La clé reste **stockée** en base
   * (`admin_settings.commissions`) et éditable par l'écran de paramétrage — la
   * retirer casserait la lecture des lignes existantes.
   */
  annualPlatformFeePct: number;
  /** @deprecated Idem : frais de gestion locative, hors périmètre. */
  rentManagementFeePct: number;
  /** % de la plus-value brute à la vente du bien (sortie). */
  propertySaleGainFeePct: number;
  /** % du montant de la vente, à la charge du vendeur (marché secondaire). */
  resaleTransactionFeePct: number;
  /** % de la plus-value du vendeur sur revente (marché secondaire). */
  shareSaleGainFeePct: number;
}

/** Les taux de repli, appliqués à toute clé absente ou illisible. */
export const TAUX_PAR_DEFAUT: BaremeDesFraisSnapshot = {
  annualPlatformFeePct: 1,
  rentManagementFeePct: 7,
  propertySaleGainFeePct: 15,
  resaleTransactionFeePct: 1,
  shareSaleGainFeePct: 15,
};

/**
 * **Le barème des commissions** — ce que la plateforme prélève, et sur quoi.
 *
 * C'est une **Policy** au sens de §22, et le module le disait déjà : les taux
 * ne sont pas figés dans le code, ils sont configurés par le
 * super-administrateur. Ce qui manquait, c'était le modèle : les cinq taux
 * circulaient en enregistrement de `number`, et les trois règles qui les
 * appliquent vivaient dans un service applicatif — donc hors du domaine, alors
 * qu'elles décident de l'argent que BeOwn encaisse (§14).
 *
 * **Le barème se lit une fois et s'applique autant qu'on veut.** C'est la
 * différence qui compte avec ce qu'il remplace : les calculs étaient des
 * méthodes `async` du service, chacune relisant la base à moins qu'on ne lui
 * passe un « snapshot » optionnel. Une opération appliquant plusieurs frais
 * devait donc **penser** à lire les taux d'abord et à les repasser à chaque
 * appel — une convention tenue par un commentaire, que le contrôleur de
 * signature honorait avec un `feeRates!` et que la sortie de projet ignorait.
 * Un administrateur modifiant les commissions entre deux calculs faisait
 * dériver les taux au milieu d'une vente. Ici la dérive est **inexprimable** :
 * on n'applique pas un barème qu'on n'a pas chargé.
 *
 * Les montants restent des `number`. `Money` ne franchit pas la frontière du
 * contexte, et trois contextes consomment ce barème — `catalog`,
 * `secondary-market`, et l'endpoint public.
 */
export class BaremeDesFrais {
  private constructor(
    private readonly plusValueDeSortie: Pourcentage,
    private readonly transactionDeRevente: Pourcentage,
    private readonly plusValueDeRevente: Pourcentage,
    /** Conservés pour la persistance et l'écran d'administration seulement. */
    private readonly horsPerimetre: Pick<
      BaremeDesFraisSnapshot,
      'annualPlatformFeePct' | 'rentManagementFeePct'
    >,
  ) {}

  /**
   * Reconstitution depuis le blob de paramétrage — un JSON libre, dont chaque
   * clé peut manquer ou être illisible. Aucune ne lève : le repli est le taux
   * par défaut, parce qu'une ligne mal saisie ne doit pas empêcher la
   * plateforme de facturer.
   *
   * Les clés héritées que le blob peut encore porter (`investmentFeePct`…) sont
   * simplement ignorées : elles ne figurent pas dans ce qu'on lit.
   */
  static restore(blob: Record<string, unknown> = {}): BaremeDesFrais {
    const taux = (cle: keyof BaremeDesFraisSnapshot): Pourcentage =>
      Pourcentage.restore(blob[cle], Pourcentage.de(TAUX_PAR_DEFAUT[cle]));

    return new BaremeDesFrais(
      taux('propertySaleGainFeePct'),
      taux('resaleTransactionFeePct'),
      taux('shareSaleGainFeePct'),
      {
        annualPlatformFeePct: taux('annualPlatformFeePct').valeurEnPourCent,
        rentManagementFeePct: taux('rentManagementFeePct').valeurEnPourCent,
      },
    );
  }

  /** Le barème appliqué en l'absence de tout paramétrage. */
  static parDefaut(): BaremeDesFrais {
    return BaremeDesFrais.restore();
  }

  // ── Ce que la plateforme prélève ──────────────────────────────────────────

  /**
   * Frais sur la plus-value réalisée à la vente du bien (sortie de projet).
   *
   * **Pas de frais sur une moins-value** : la plateforme ne se rémunère pas sur
   * une perte. La règle vivait dans un `if (plusValue <= 0) return 0` du
   * service applicatif ; elle est ici parce qu'elle dit ce que BeOwn a le droit
   * de prélever, ce qui est du métier (§9, §14).
   */
  fraisSurPlusValueDeSortie(plusValue: number): number {
    return plusValue <= 0 ? 0 : this.plusValueDeSortie.appliqueA(plusValue);
  }

  /**
   * Frais du vendeur sur le marché secondaire : un pourcentage du montant de la
   * vente, **et** un pourcentage de sa plus-value.
   *
   * Les deux sont rendus ensemble parce qu'ils sont dus ensemble : ils
   * s'appliquent à la même cession, et les calculer séparément a déjà conduit
   * un appelant à additionner deux frais issus de deux lectures de taux
   * différentes.
   */
  fraisDeRevente(
    montantVente: number,
    plusValueVendeur: number,
  ): { transactionFee: number; gainFee: number } {
    return {
      transactionFee: this.transactionDeRevente.appliqueA(montantVente),
      // Même règle que la sortie : rien sur une moins-value.
      gainFee:
        plusValueVendeur <= 0
          ? 0
          : this.plusValueDeRevente.appliqueA(plusValueVendeur),
    };
  }

  /** Les taux à plat — ce que l'endpoint public et l'administration lisent. */
  toSnapshot(): BaremeDesFraisSnapshot {
    return {
      ...this.horsPerimetre,
      propertySaleGainFeePct: this.plusValueDeSortie.valeurEnPourCent,
      resaleTransactionFeePct: this.transactionDeRevente.valeurEnPourCent,
      shareSaleGainFeePct: this.plusValueDeRevente.valeurEnPourCent,
    };
  }
}
