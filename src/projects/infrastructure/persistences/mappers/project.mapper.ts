import { Project } from 'src/projects/domains/project';
import { Spv } from 'src/projects/domains/spv';
import { ModeleEconomique } from 'src/projects/domains/enums/modele-economique.enum';
import { ProjectEntity } from '../entities/project.entity';
import { SpvEntity } from '../entities/spv.entity';

export class ProjectMapper {
  static toDomain(this: void, entity: ProjectEntity): Project {
    const domain = new Project();
    domain.id = entity.id;
    domain.slug = entity.slug;
    domain.titre = entity.titre;
    domain.spvId = entity.spvId;
    // Projection en lecture seule : renseignée uniquement quand la relation
    // `spv` a été jointe par le repository (jamais de requête supplémentaire ici,
    // ce qui provoquerait un N+1 sur les listes).
    domain.societeSupportNom = entity.spv?.raisonSociale ?? null;
    domain.porteurId = entity.porteurId;
    domain.type = entity.type;
    domain.ville = entity.ville;
    domain.region = entity.region;
    domain.pays = entity.pays;
    domain.adresseComplete = entity.adresseComplete;
    domain.latitude = entity.latitude != null ? Number(entity.latitude) : null;
    domain.longitude =
      entity.longitude != null ? Number(entity.longitude) : null;
    domain.youtubeUrl = entity.youtubeUrl;
    domain.capitalCible = Number(entity.capitalCible);
    domain.capitalMinimum = Number(entity.capitalMinimum);
    domain.ticketMinimum = Number(entity.ticketMinimum);
    domain.ticketMaximum =
      entity.ticketMaximum != null ? Number(entity.ticketMaximum) : null;
    domain.triCible = entity.triCible != null ? Number(entity.triCible) : null;
    domain.indiceRisque = entity.indiceRisque != null ? Number(entity.indiceRisque) : 3;
    domain.dureeMois = entity.dureeMois;
    domain.instrument = entity.instrument;
    domain.statut = entity.statut;
    domain.estPreInvestissable = entity.estPreInvestissable;
    domain.plafondPreInvestissement =
      entity.plafondPreInvestissement != null
        ? Number(entity.plafondPreInvestissement)
        : null;
    domain.nbFractions = entity.nbFractions;
    domain.prixFraction =
      entity.prixFraction != null ? Number(entity.prixFraction) : null;
    domain.datePublication = entity.datePublication;
    domain.dateOuvertureCollecte = entity.dateOuvertureCollecte;
    domain.dateCloturePrevue = entity.dateCloturePrevue;
    domain.descriptionMd = entity.descriptionMd;
    domain.avertissementMd = entity.avertissementMd;
    domain.fici = entity.fici ?? null;
    domain.previsionnel = entity.previsionnel ?? null;
    domain.chronologie = entity.chronologie ?? [];
    domain.garanties = entity.garanties ?? [];
    // LECTURE : le repli sur OBLIGATAIRE est conservé — les lignes créées avant
    // l'ajout de la colonne peuvent la porter à NULL. Un projet dont le modèle
    // est inconnu est traité comme obligataire (comportement historique).
    domain.modeleEconomique =
      entity.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE;
    domain.nbUnitesLouables = entity.nbUnitesLouables ?? null;
    domain.broadcastAnnonceAt = entity.broadcastAnnonceAt ?? null;
    domain.broadcastCollecteAt = entity.broadcastCollecteAt ?? null;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static toEntity(domain: Project): ProjectEntity {
    const entity = new ProjectEntity();
    if (domain.id) entity.id = domain.id;
    entity.slug = domain.slug;
    entity.titre = domain.titre;
    entity.spvId = domain.spvId;
    entity.porteurId = domain.porteurId;
    entity.type = domain.type;
    entity.ville = domain.ville;
    entity.region = domain.region;
    entity.pays = domain.pays;
    entity.adresseComplete = domain.adresseComplete;
    entity.latitude = domain.latitude;
    entity.longitude = domain.longitude;
    entity.youtubeUrl = domain.youtubeUrl;
    entity.capitalCible = domain.capitalCible;
    entity.capitalMinimum = domain.capitalMinimum;
    entity.ticketMinimum = domain.ticketMinimum;
    entity.ticketMaximum = domain.ticketMaximum;
    entity.triCible = domain.triCible;
    entity.indiceRisque = domain.indiceRisque ?? 3;
    entity.dureeMois = domain.dureeMois;
    entity.instrument = domain.instrument;
    entity.statut = domain.statut;
    entity.estPreInvestissable = domain.estPreInvestissable;
    entity.plafondPreInvestissement = domain.plafondPreInvestissement;
    entity.nbFractions = domain.nbFractions;
    entity.prixFraction = domain.prixFraction;
    entity.datePublication = domain.datePublication;
    entity.dateOuvertureCollecte = domain.dateOuvertureCollecte;
    entity.dateCloturePrevue = domain.dateCloturePrevue;
    entity.descriptionMd = domain.descriptionMd;
    entity.avertissementMd = domain.avertissementMd;
    entity.fici = domain.fici ?? null;
    entity.previsionnel = domain.previsionnel;
    entity.chronologie = domain.chronologie ?? [];
    entity.garanties = domain.garanties ?? [];
    // ÉCRITURE : aucun repli. Le `?? OBLIGATAIRE` qui figurait ici réécrivait
    // silencieusement le modèle d'un projet EQUITY dès qu'un domaine reconstruit
    // sans le champ était sauvegardé — le commutateur était donc inécrivable en
    // pratique. On n'affecte la colonne que si le domaine porte une valeur ;
    // sinon on laisse le DEFAULT de colonne (`obligataire`) jouer à l'INSERT et
    // la valeur en base intacte à l'UPDATE. Même pattern que broadcast*At.
    if (domain.modeleEconomique != null) {
      entity.modeleEconomique = domain.modeleEconomique;
    }
    entity.nbUnitesLouables = domain.nbUnitesLouables ?? null;
    // Posés uniquement par BroadcastService (UPDATE ciblé) : on ne les écrase
    // que si le domaine les porte, pour qu'un save() issu d'un domaine
    // reconstruit sans ces champs ne les remette jamais à null.
    if (domain.broadcastAnnonceAt !== undefined) {
      entity.broadcastAnnonceAt = domain.broadcastAnnonceAt;
    }
    if (domain.broadcastCollecteAt !== undefined) {
      entity.broadcastCollecteAt = domain.broadcastCollecteAt;
    }
    return entity;
  }

  static spvToDomain(entity: SpvEntity): Spv {
    const domain = new Spv();
    domain.id = entity.id;
    domain.raisonSociale = entity.raisonSociale;
    domain.siren = entity.siren;
    domain.forme = entity.forme;
    domain.capitalSocial =
      entity.capitalSocial != null ? Number(entity.capitalSocial) : null;
    domain.siegeAdresse = entity.siegeAdresse;
    domain.iban = entity.iban;
    // Equity-locatif fields
    domain.dateConstitution = entity.dateConstitution;
    domain.statutsPdfUrl = entity.statutsPdfUrl;
    domain.regimeFiscal = entity.regimeFiscal;
    domain.gestionnaireUserId = entity.gestionnaireUserId;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static spvToEntity(domain: Spv): SpvEntity {
    const entity = new SpvEntity();
    if (domain.id) entity.id = domain.id;
    entity.raisonSociale = domain.raisonSociale;
    entity.siren = domain.siren;
    entity.forme = domain.forme;
    entity.capitalSocial = domain.capitalSocial;
    entity.siegeAdresse = domain.siegeAdresse;
    entity.iban = domain.iban;
    // Equity-locatif fields
    entity.dateConstitution = domain.dateConstitution;
    entity.statutsPdfUrl = domain.statutsPdfUrl;
    entity.regimeFiscal = domain.regimeFiscal;
    entity.gestionnaireUserId = domain.gestionnaireUserId;
    return entity;
  }
}
