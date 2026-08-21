import { CreerProjetProps } from 'src/projects/domains/factories/project.factory';
import { ModificationProjet } from 'src/projects/domains/project';
import { CreateProjectDto, UpdateProjectDto } from '../dto/project.dto';

/**
 * Traduit les DTO HTTP en entrées du domaine.
 *
 * C'est le travail propre à la présentation : le use case ne doit pas connaître
 * `CreateProjectDto`. Il le recevait pourtant en argument — un objet de la
 * couche présentation importé par la couche applicative, donc une flèche de
 * dépendance à l'envers (§1).
 *
 * Deux traductions seulement, et elles sont mécaniques : rien ici ne décide, ne
 * valide ni ne complète. Les valeurs par défaut sont posées par
 * `ProjectFactory` et les Value Objects — pas dans ce fichier, sans quoi elles
 * seraient à nouveau hors de portée des autres points d'entrée.
 */
export function versPropsDeCreation(dto: CreateProjectDto): CreerProjetProps {
  return {
    titre: dto.titre,
    slug: dto.slug,
    type: dto.type,
    spvId: dto.spvId,
    statut: dto.statut,
    ville: dto.ville,
    region: dto.region,
    pays: dto.pays,
    adresseComplete: dto.adresseComplete,
    latitude: dto.latitude,
    longitude: dto.longitude,
    capitalCible: dto.capitalCible,
    capitalMinimum: dto.capitalMinimum,
    ticketMinimum: dto.ticketMinimum,
    ticketMaximum: dto.ticketMaximum,
    triCible: dto.triCible,
    indiceRisque: dto.indiceRisque,
    dureeMois: dto.dureeMois,
    instrument: dto.instrument,
    estPreInvestissable: dto.estPreInvestissable,
    plafondPreInvestissement: dto.plafondPreInvestissement,
    nbFractions: dto.nbFractions,
    prixFraction: dto.prixFraction,
    datePublication: dto.datePublication,
    dateOuvertureCollecte: dto.dateOuvertureCollecte,
    dateCloturePrevue: dto.dateCloturePrevue,
    descriptionMd: dto.descriptionMd,
    avertissementMd: dto.avertissementMd,
    youtubeUrl: dto.youtubeUrl,
    previsionnel: dto.previsionnel,
    chronologie: dto.chronologie,
    garanties: dto.garanties,
  };
}

/**
 * Ne reporte que les champs **présents** dans la requête.
 *
 * La distinction est celle qu'attend {@link ModificationProjet} : `undefined`
 * laisse le champ en place, `null` l'efface. La recopier ici, plutôt que de
 * passer le DTO tel quel, évite qu'un champ absent du corps JSON n'arrive au
 * domaine comme une demande d'effacement.
 */
export function versModificationProjet(
  dto: UpdateProjectDto,
): ModificationProjet {
  const modification: ModificationProjet = {};
  for (const [champ, valeur] of Object.entries(dto)) {
    if (valeur !== undefined) {
      (modification as Record<string, unknown>)[champ] = valeur;
    }
  }
  return modification;
}
