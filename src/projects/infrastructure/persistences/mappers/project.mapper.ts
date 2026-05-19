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
    domain.previsionnel = entity.previsionnel ?? null;
    domain.chronologie = entity.chronologie ?? [];
    domain.garanties = entity.garanties ?? [];
    domain.modeleEconomique =
      entity.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE;
    domain.nbUnitesLouables = entity.nbUnitesLouables ?? null;
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
    entity.previsionnel = domain.previsionnel;
    entity.chronologie = domain.chronologie ?? [];
    entity.garanties = domain.garanties ?? [];
    entity.modeleEconomique =
      domain.modeleEconomique ?? ModeleEconomique.OBLIGATAIRE;
    entity.nbUnitesLouables = domain.nbUnitesLouables ?? null;
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
