import {
  SortieProjet,
  SortieProjetSnapshot,
} from '../aggregates/sortie-projet';

/**
 * Traduit la sortie entre sa forme d'agrégat et sa forme à plat.
 *
 * `restore` ne rejoue aucun invariant : il n'y a pas de raison de recalculer la
 * plus-value d'une sortie déjà écrite — la relire, c'est constater ce qui a été
 * distribué, pas le refaire. Ne pas confondre avec `SortieProjetOrmMapper`
 * (infrastructure).
 */
export class SortieProjetMapper {
  static restore(snapshot: SortieProjetSnapshot): SortieProjet {
    return new SortieProjet({
      id: snapshot.id,
      projetId: snapshot.projetId,
      prixRevente: Number(snapshot.prixRevente),
      dateRevente: snapshot.dateRevente,
      plusValueBrute: Number(snapshot.plusValueBrute),
      statut: snapshot.statut,
      acteVentePdfUrl: snapshot.acteVentePdfUrl,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    });
  }

  static toSnapshot(sortie: SortieProjet): SortieProjetSnapshot {
    return {
      id: sortie.id,
      projetId: sortie.projetId,
      prixRevente: sortie.prixRevente,
      dateRevente: sortie.dateRevente,
      plusValueBrute: sortie.plusValueBrute,
      statut: sortie.statut,
      acteVentePdfUrl: sortie.acteVentePdfUrl,
      createdAt: sortie.createdAt,
      updatedAt: sortie.updatedAt,
    };
  }
}
