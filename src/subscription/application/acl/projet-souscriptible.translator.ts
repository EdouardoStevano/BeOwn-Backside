import type { Project } from 'src/catalog/domain/aggregates/project';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import type { ProjetSouscriptible } from '../../domain/value-objects/projet-souscriptible';

/**
 * **Anti-Corruption Layer vers `catalog`** (§13, §20) — le seul endroit du
 * contexte qui lise l'agrégat `Project` du contexte amont.
 *
 * La relation est Customer/Supplier (§3.4) : `catalog` fournit le statut du
 * projet et ses conditions financières, `subscription` les consomme. Le
 * domaine de ce contexte ne doit pas parler le vocabulaire de `catalog`
 * (`ProjectStatus`, `ConditionsFinancieres`…) — ce traducteur le convertit en
 * {@link ProjetSouscriptible}. Si `catalog` remodèle son agrégat demain, c'est
 * cette classe qui absorbe le choc, pas la Factory ni la Capacity.
 *
 * Deux dérivations méritent d'être signalées, parce qu'elles réparent une
 * duplication silencieuse : `prixUnitaireFraction` et `nbFractionsTotal`
 * existaient **déjà** sur l'agrégat `Project`, avec exactement la formule que
 * `CreateInvestmentUseCase`, `InitiateInvestmentUseCase` et
 * `TopUpInvestmentUseCase` recopiaient chacun à la main
 * (`ticketMinimum`, puis `nbFractions ?? capitalCible / prixFraction`). Le
 * contexte amont était donc déjà la source de vérité ; il n'était pas
 * interrogé. Il l'est désormais, en un seul point.
 */
export class ProjetSouscriptibleTranslator {
  static traduire(projet: Project): ProjetSouscriptible {
    return {
      projetId: projet.id,
      enCollecte: projet.statut === ProjectStatus.EN_COLLECTE,
      dejaFinance: projet.statut === ProjectStatus.FINANCE,
      instrument: projet.instrument,
      prixFraction: projet.prixUnitaireFraction,
      nbFractionsTotal: projet.nbFractionsTotal,
      ticketMaximum: projet.ticketMaximum,
      triCible: projet.triCible ?? 0,
      dureeMois: projet.dureeMois,
    };
  }
}
