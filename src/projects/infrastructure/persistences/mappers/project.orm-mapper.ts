import { ProjectMapper } from 'src/projects/domains/mappers/project.mapper';
import { Project } from 'src/projects/domains/project';
import { ProjectEntity } from '../entities/project.entity';

/**
 * Traduit entre la ligne TypeORM et l'agrégat.
 *
 * Le mapper de ce niveau ne connaît que deux choses : la forme de la table, et
 * le snapshot du domaine. Il ne construit pas l'agrégat lui-même — il passe le
 * snapshot à {@link ProjectMapper.restore}, qui sait le faire renaître. C'est
 * le découpage retenu par `KycOrmMapper`, et il évite qu'une seconde
 * connaissance des Value Objects du projet s'installe dans l'infrastructure.
 *
 * La conversion des `decimal` en `number` reste ici : c'est une propriété du
 * pilote Postgres, qui rend ces colonnes en chaînes.
 */
export class ProjectOrmMapper {
  static toDomain(this: void, entity: ProjectEntity): Project {
    return ProjectMapper.restore({
      id: entity.id,
      slug: entity.slug,
      titre: entity.titre,
      type: entity.type,
      spvId: entity.spvId,
      porteurId: entity.porteurId,
      statut: entity.statut,
      ville: entity.ville,
      region: entity.region,
      pays: entity.pays,
      adresseComplete: entity.adresseComplete,
      latitude: entity.latitude != null ? Number(entity.latitude) : null,
      longitude: entity.longitude != null ? Number(entity.longitude) : null,
      capitalCible: Number(entity.capitalCible),
      capitalMinimum: Number(entity.capitalMinimum),
      ticketMinimum: Number(entity.ticketMinimum),
      ticketMaximum:
        entity.ticketMaximum != null ? Number(entity.ticketMaximum) : null,
      triCible: entity.triCible != null ? Number(entity.triCible) : null,
      indiceRisque:
        entity.indiceRisque != null ? Number(entity.indiceRisque) : 3,
      dureeMois: entity.dureeMois,
      instrument: entity.instrument,
      estPreInvestissable: entity.estPreInvestissable,
      plafondPreInvestissement:
        entity.plafondPreInvestissement != null
          ? Number(entity.plafondPreInvestissement)
          : null,
      nbFractions: entity.nbFractions,
      prixFraction:
        entity.prixFraction != null ? Number(entity.prixFraction) : null,
      datePublication: entity.datePublication,
      dateOuvertureCollecte: entity.dateOuvertureCollecte,
      dateCloturePrevue: entity.dateCloturePrevue,
      descriptionMd: entity.descriptionMd,
      avertissementMd: entity.avertissementMd,
      youtubeUrl: entity.youtubeUrl,
      previsionnel: entity.previsionnel ?? null,
      garanties: entity.garanties,
      chronologie: entity.chronologie,
      modeleEconomique: entity.modeleEconomique,
      nbUnitesLouables: entity.nbUnitesLouables,
      broadcastAnnonceAt: entity.broadcastAnnonceAt,
      broadcastCollecteAt: entity.broadcastCollecteAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(project: Project): ProjectEntity {
    const snapshot = project.toSnapshot();
    const entity = new ProjectEntity();
    if (snapshot.id) entity.id = snapshot.id;
    entity.slug = snapshot.slug;
    entity.titre = snapshot.titre;
    entity.type = snapshot.type;
    entity.spvId = snapshot.spvId;
    entity.porteurId = snapshot.porteurId;
    entity.statut = snapshot.statut;
    entity.ville = snapshot.ville;
    entity.region = snapshot.region;
    entity.pays = snapshot.pays;
    entity.adresseComplete = snapshot.adresseComplete;
    entity.latitude = snapshot.latitude;
    entity.longitude = snapshot.longitude;
    entity.capitalCible = snapshot.capitalCible;
    entity.capitalMinimum = snapshot.capitalMinimum;
    entity.ticketMinimum = snapshot.ticketMinimum;
    entity.ticketMaximum = snapshot.ticketMaximum;
    entity.triCible = snapshot.triCible;
    entity.indiceRisque = snapshot.indiceRisque;
    entity.dureeMois = snapshot.dureeMois;
    entity.instrument = snapshot.instrument;
    entity.estPreInvestissable = snapshot.estPreInvestissable;
    entity.plafondPreInvestissement = snapshot.plafondPreInvestissement;
    entity.nbFractions = snapshot.nbFractions;
    entity.prixFraction = snapshot.prixFraction;
    entity.datePublication = snapshot.datePublication;
    entity.dateOuvertureCollecte = snapshot.dateOuvertureCollecte;
    entity.dateCloturePrevue = snapshot.dateCloturePrevue;
    entity.descriptionMd = snapshot.descriptionMd;
    entity.avertissementMd = snapshot.avertissementMd;
    entity.youtubeUrl = snapshot.youtubeUrl;
    entity.previsionnel = snapshot.previsionnel;
    entity.chronologie = snapshot.chronologie;
    entity.garanties = snapshot.garanties;
    entity.modeleEconomique = snapshot.modeleEconomique;
    entity.nbUnitesLouables = snapshot.nbUnitesLouables;
    // Volontairement absents de l'écriture, et TypeORM ignore les propriétés
    // `undefined` — un `save()` ne les écrase donc jamais :
    //
    // - `echeancierEmprunteur`, `motifAnnulation`, `annuleLe` : l'agrégat ne
    //   les porte pas ;
    // - `broadcastAnnonceAt`, `broadcastCollecteAt` : ils appartiennent à
    //   `BroadcastService`, qui les pose par un `UPDATE` **conditionnel**
    //   (`WHERE colonne IS NULL`) dont l'atomicité est ce qui garantit qu'une
    //   campagne ne part qu'une fois. Le projet les transporte en lecture — la
    //   réponse JSON les contient — mais ne les réécrit jamais. La distinction
    //   compte depuis que le changement de statut et le CRON de chronologie
    //   enregistrent l'agrégat **entier** : un `save()` qui les reposerait à
    //   leur valeur d'avant chargement rearmerait une campagne déjà envoyée.
    return entity;
  }
}
