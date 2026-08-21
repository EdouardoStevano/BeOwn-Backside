import { ModeleEconomique } from '../enums/modele-economique.enum';
import { Project, ProjectSnapshot, ProjectSnapshotBrut } from '../project';
import { CalendrierProjet } from '../value-objects/calendrier-projet.vo';
import { Chronologie } from '../value-objects/chronologie.vo';
import { ConditionsFinancieres } from '../value-objects/conditions-financieres.vo';
import { Localisation } from '../value-objects/localisation.vo';
import { StatutProjet } from '../value-objects/statut-projet.vo';

/**
 * Traduit le projet entre sa forme d'agrégat et sa forme à plat.
 *
 * Deux sens, un seul endroit :
 *
 * - {@link restore} fait **renaître** un projet depuis la persistance. Il ne
 *   rejoue aucun invariant : les lignes écrites avant que
 *   {@link ConditionsFinancieres} et {@link Localisation} n'existent peuvent
 *   les enfreindre, et un catalogue qu'on ne peut plus relire est pire qu'un
 *   catalogue imparfait. Éprouver ce qui entre, pas ce qui est déjà écrit —
 *   c'est la règle de `KycMapper` et de `DecisionKyc.restore` ;
 * - {@link toSnapshot} rend la forme publiée. Les clés sont exactement celles
 *   que l'API rendait quand l'agrégat était un sac d'attributs publics, et
 *   c'est un contrat : le front les lit.
 *
 * Ne pas confondre avec `ProjectOrmMapper` (infrastructure), qui traduit entre
 * ce snapshot et la ligne TypeORM.
 */
export class ProjectMapper {
  static restore(snapshot: ProjectSnapshotBrut): Project {
    return new Project({
      entete: {
        id: snapshot.id,
        slug: snapshot.slug,
        titre: snapshot.titre,
        type: snapshot.type,
        spvId: snapshot.spvId,
        porteurId: snapshot.porteurId,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
      statut: StatutProjet.restore(snapshot.statut),
      localisation: Localisation.restore({
        ville: snapshot.ville,
        region: snapshot.region,
        pays: snapshot.pays,
        adresseComplete: snapshot.adresseComplete,
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
      }),
      conditions: ConditionsFinancieres.restore({
        capitalCible: snapshot.capitalCible,
        capitalMinimum: snapshot.capitalMinimum,
        ticketMinimum: snapshot.ticketMinimum,
        ticketMaximum: snapshot.ticketMaximum,
        triCible: snapshot.triCible,
        indiceRisque: snapshot.indiceRisque,
        dureeMois: snapshot.dureeMois,
        instrument: snapshot.instrument,
        estPreInvestissable: snapshot.estPreInvestissable,
        plafondPreInvestissement: snapshot.plafondPreInvestissement,
        nbFractions: snapshot.nbFractions,
        prixFraction: snapshot.prixFraction,
      }),
      calendrier: CalendrierProjet.restore({
        datePublication: snapshot.datePublication,
        dateOuvertureCollecte: snapshot.dateOuvertureCollecte,
        dateCloturePrevue: snapshot.dateCloturePrevue,
      }),
      contenu: {
        descriptionMd: snapshot.descriptionMd,
        avertissementMd: snapshot.avertissementMd,
        youtubeUrl: snapshot.youtubeUrl,
        previsionnel: snapshot.previsionnel ?? null,
        garanties: snapshot.garanties ?? [],
      },
      chronologie: Chronologie.restore(snapshot.chronologie),
      // Le défaut vaut pour les lignes antérieures à l'extension equity-locatif.
      modeleEconomique:
        snapshot.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE,
      nbUnitesLouables: snapshot.nbUnitesLouables ?? null,
      diffusions: {
        broadcastAnnonceAt: snapshot.broadcastAnnonceAt ?? null,
        broadcastCollecteAt: snapshot.broadcastCollecteAt ?? null,
      },
    });
  }

  static toSnapshot(project: Project): ProjectSnapshot {
    return {
      id: project.id,
      slug: project.slug,
      titre: project.titre,
      type: project.type,
      spvId: project.spvId,
      porteurId: project.porteurId,
      statut: project.statut,
      ...project.localisation.toSnapshot(),
      ...project.conditions.toSnapshot(),
      ...project.calendrier.toSnapshot(),
      descriptionMd: project.descriptionMd,
      avertissementMd: project.avertissementMd,
      youtubeUrl: project.youtubeUrl,
      previsionnel: project.previsionnel,
      garanties: project.garanties,
      chronologie: project.chronologie,
      modeleEconomique: project.modeleEconomique,
      nbUnitesLouables: project.nbUnitesLouables,
      ...project.diffusions,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
