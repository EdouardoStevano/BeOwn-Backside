import { CreateProfilPPDto } from 'src/profiles/presenters/dto/profil.dto';
import { ChampsDeclaresProfilPP } from 'src/profiles/domains/profil-pp';

/**
 * Traduit le DTO HTTP en champs déclarés du domaine.
 *
 * L'intérêt est dans ce qui **n'est pas** repris : `patrimoineDeclare` et
 * `montantMaxConseille` figurent dans le DTO mais sont le résultat du
 * questionnaire d'adéquation (`SaveQuestionnaireUseCase`), pas une déclaration
 * libre. Les laisser passer permettrait de s'attribuer un plafond
 * d'investissement — et donc de contourner la limite PSFP de 5 % du patrimoine
 * — sans jamais répondre au questionnaire. Le use case de création les
 * ignorait déjà ; celui de mise à jour, lui, les recopiait via
 * `Object.assign`.
 *
 * La liste est écrite en toutes lettres plutôt que déduite par un `rest` :
 * ajouter un champ au DTO ne doit pas suffire à le faire entrer dans le
 * domaine, la décision doit se prendre ici.
 */
export function champsDeclaresDepuisDto(
  dto: Partial<CreateProfilPPDto>,
): ChampsDeclaresProfilPP {
  return {
    civilite: dto.civilite,
    dateNaissance: dto.dateNaissance,
    lieuNaissance: dto.lieuNaissance,
    nationalite: dto.nationalite,
    adresseLigne1: dto.adresseLigne1,
    adresseLigne2: dto.adresseLigne2,
    codePostal: dto.codePostal,
    ville: dto.ville,
    pays: dto.pays,
    telephone: dto.telephone,
    profession: dto.profession,
    secteurActivite: dto.secteurActivite,
    pep: dto.pep,
    residenceFiscale: dto.residenceFiscale,
    nif: dto.nif,
  };
}
