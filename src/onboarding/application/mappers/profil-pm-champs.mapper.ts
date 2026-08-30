import {
  CreateProfilPMDto,
  UpdateProfilPMDto,
} from 'src/onboarding/presentation/http/dto/profil.dto';
import { ChampsDeclaresProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';

/**
 * Traduit le DTO HTTP en champs déclarés du domaine.
 *
 * L'intérêt est dans ce qui **n'est pas** repris : `representantId`. Le domaine
 * sait le porter — un import ou un script d'administration peut légitimement
 * rattacher un représentant légal — mais il ne doit pas s'attribuer depuis un
 * formulaire. Le représentant signe les bulletins de souscription au nom de la
 * société ; se désigner soi-même en glissant une clé dans un PATCH ouvrirait
 * une prise de contrôle. Sa désignation demandera son propre flux, avec les
 * vérifications qui vont avec.
 *
 * La liste est écrite en toutes lettres plutôt que déduite par un `rest` :
 * ajouter un champ au DTO ne doit pas suffire à le faire entrer dans le
 * domaine, la décision doit se prendre ici.
 */
export function champsDeclaresDepuisDto(
  dto: CreateProfilPMDto | UpdateProfilPMDto,
): ChampsDeclaresProfilPM {
  return {
    raisonSociale: dto.raisonSociale,
    formeJuridique: dto.formeJuridique,
    siren: dto.siren,
    rcsVille: dto.rcsVille,
    capitalSocial: dto.capitalSocial,
    siegeAdresse: dto.siegeAdresse,
    secteurActivite: dto.secteurActivite,
  };
}
