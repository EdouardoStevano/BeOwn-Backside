import { getMetadataArgsStorage } from 'typeorm';
import {
  STATUTS_NON_TERMINAUX,
  StatutDemandeAccesPorteur,
  estTerminal,
} from 'src/porteur-access/domains/demande-acces-porteur';
import { DemandeAccesPorteurEntity } from './demande-acces-porteur.entity';

/**
 * PARITÉ entre la clause `WHERE` de l'index unique partiel et
 * `STATUTS_NON_TERMINAUX` — l'invariant « une seule demande en cours par
 * compte » repose sur les deux, et une divergence rouvre exactement le doublon
 * que l'index existe pour interdire.
 *
 * Le lot 4 AFFIRMAIT dans deux endroits (entité et ADR) qu'« un test éprouve la
 * parité ». Aucun test ne lisait la clause : c'est celui-ci. Il lit la
 * MÉTADONNÉE TypeORM réelle du décorateur `@Index` — donc ce qui sera
 * effectivement posé en base par le `synchronize` du seed — et la compare au
 * domaine. Recopier la liste attendue dans le test n'aurait rien prouvé.
 *
 * Aucune base n'est ouverte : `getMetadataArgsStorage()` est alimenté à
 * l'évaluation des décorateurs, c'est-à-dire au simple import de l'entité.
 */

const NOM_INDEX_UNIQUE = 'UQ_demande_acces_porteur_en_cours';

/** Métadonnées d'index déclarées sur l'entité, telles que TypeORM les voit. */
const indicesDeLEntite = () =>
  getMetadataArgsStorage().indices.filter(
    (index) => index.target === DemandeAccesPorteurEntity,
  );

/**
 * Statuts cités dans une clause `statut IN ('a', 'b')`, dans l'ordre de la
 * clause. Extraction et non comparaison de chaîne : la mise en forme du SQL
 * (espaces, guillemets simples ou doubles, retours à la ligne) n'est pas ce
 * qu'on éprouve — le VOCABULAIRE l'est.
 */
const statutsDeLaClause = (where: string): string[] =>
  [...where.matchAll(/'([^']+)'/g)].map(([, valeur]) => valeur);

describe('Index unique partiel de demande_acces_porteur', () => {
  it('est bien déclaré, unique, et porte une clause WHERE', () => {
    const index = indicesDeLEntite().find((i) => i.name === NOM_INDEX_UNIQUE);
    expect(index).toBeDefined();
    expect(index?.unique).toBe(true);
    expect(index?.columns).toEqual(['utilisateurId']);
    expect(typeof index?.where).toBe('string');
  });

  it('sa clause WHERE cite EXACTEMENT les statuts non terminaux du domaine', () => {
    const index = indicesDeLEntite().find((i) => i.name === NOM_INDEX_UNIQUE);
    const cites = statutsDeLaClause(index?.where ?? '');

    // Ensembliste : l'ordre d'énumération dans un `IN` n'a pas de sens.
    expect([...cites].sort()).toEqual([...STATUTS_NON_TERMINAUX].sort());
  });

  it('et ne cite AUCUN statut terminal (le doublon resterait interdit à tort)', () => {
    const index = indicesDeLEntite().find((i) => i.name === NOM_INDEX_UNIQUE);
    const cites = statutsDeLaClause(index?.where ?? '');

    // Contre-épreuve : un statut terminal dans la clause empêcherait à jamais
    // un compte de redéposer après un refus ou un retrait.
    for (const statut of cites) {
      expect(estTerminal(statut as StatutDemandeAccesPorteur)).toBe(false);
    }
  });

  it('la clause ne cite que des statuts CONNUS du domaine', () => {
    const index = indicesDeLEntite().find((i) => i.name === NOM_INDEX_UNIQUE);
    const connus = Object.values(StatutDemandeAccesPorteur) as string[];

    for (const statut of statutsDeLaClause(index?.where ?? '')) {
      expect(connus).toContain(statut);
    }
  });
});
