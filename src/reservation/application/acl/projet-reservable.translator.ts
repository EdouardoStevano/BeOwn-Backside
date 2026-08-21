import type { Project } from 'src/catalog/domain/aggregates/project';
import { ProjectStatus } from 'src/catalog/domain/enums/project-status.enum';
import type { ProjetReservable } from '../../domain/value-objects/projet-reservable';

/**
 * **Anti-Corruption Layer vers `catalog`** (§13, §20) — le seul endroit du
 * contexte qui lise l'agrégat `Project` du contexte amont.
 *
 * La relation est Customer/Supplier (§3.4) : `catalog` fournit le statut du
 * projet et ses conditions, `reservation` les consomme. Mais le domaine de ce
 * contexte ne doit pas parler le vocabulaire de `catalog` (`ProjectStatus`,
 * `estPreInvestissable`…) — ce traducteur le convertit en
 * {@link ProjetReservable}, la vue de cinq champs dont les règles RG-RES ont
 * besoin. Si `catalog` remodèle son agrégat demain, c'est cette classe qui
 * absorbe le choc, pas la Factory ni la Capacity.
 */
export class ProjetReservableTranslator {
  static traduire(projet: Project): ProjetReservable {
    return {
      projetId: projet.id,
      enPhaseAnnonce: projet.statut === ProjectStatus.ANNONCE,
      preInvestissementActive: projet.estPreInvestissable,
      ticketMinimum: projet.ticketMinimum,
      ticketMaximum: projet.ticketMaximum,
      plafondPreInvestissement: projet.plafondPreInvestissement,
    };
  }
}
