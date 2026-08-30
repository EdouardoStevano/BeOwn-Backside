import { Inject, Injectable } from '@nestjs/common';
import type {
  BaremeDesFrais,
  BaremeDesFraisSnapshot,
} from 'src/treasury/domain/value-objects/bareme-des-frais.vo';
import {
  BAREME_DES_FRAIS_QUERY,
  type BaremeDesFraisQuery,
} from '../ports/bareme-des-frais.query';

// Le vocabulaire de ce service a rejoint le domaine, où il décide de l'argent
// que la plateforme encaisse. Ces réexports gardent les points d'import
// existants valides — l'écran d'administration lit les taux par défaut, la
// route publique publie leur forme.
export {
  BaremeDesFrais,
  TAUX_PAR_DEFAUT as DEFAULT_FEE_RATES,
  type BaremeDesFraisSnapshot as PlatformFeeRates,
} from 'src/treasury/domain/value-objects/bareme-des-frais.vo';

/**
 * L'accès au barème des commissions de la plateforme.
 *
 * **Il ne calcule plus rien**, et c'est tout le refactoring. Il portait trois
 * méthodes `async` — un frais de sortie, deux frais de revente — qui relisaient
 * chacune la base à moins qu'on ne leur passe un « snapshot » de taux en
 * paramètre optionnel. Deux choses en découlaient :
 *
 * - **les règles étaient dans la couche application** : « pas de frais sur une
 *   moins-value » décide de ce que BeOwn a le droit de prélever, ce qui est du
 *   métier (§14). Elles vivent dans {@link BaremeDesFrais} ;
 * - **la cohérence des taux tenait à une convention**. Une opération appliquant
 *   plusieurs frais devait penser à lire les taux d'abord et à les repasser à
 *   chaque appel, faute de quoi un administrateur modifiant les commissions
 *   entre deux calculs faisait dériver les taux au milieu d'une vente. Le
 *   contrôleur de signature l'honorait avec un `feeRates!`, la sortie de projet
 *   l'ignorait. Rendre le barème **une fois** rend la dérive inexprimable : on
 *   n'applique pas un barème qu'on n'a pas chargé.
 *
 * Il ne connaît plus non plus la base : la lecture passe par
 * {@link BaremeDesFraisQuery}, là où il se faisait injecter un `Repository`
 * TypeORM sur une entité de `src/admin` (§27).
 */
@Injectable()
export class PlatformFeesService {
  constructor(
    @Inject(BAREME_DES_FRAIS_QUERY)
    private readonly baremes: BaremeDesFraisQuery,
  ) {}

  /**
   * Le barème courant, à lire **une fois** par opération.
   *
   * Tout ce qui s'applique ensuite est synchrone : c'est ce qui garantit que
   * deux frais d'une même vente sont calculés au même taux.
   */
  lireLeBareme(): Promise<BaremeDesFrais> {
    return this.baremes.lire();
  }

  /**
   * Les taux à plat, pour l'affichage.
   *
   * Conservé sous ce nom parce que c'est le contrat de `GET
   * /public/platform-fees`, que le Frontside consomme pour ses simulateurs.
   */
  async getRates(): Promise<BaremeDesFraisSnapshot> {
    const bareme = await this.baremes.lire();
    return bareme.toSnapshot();
  }
}
