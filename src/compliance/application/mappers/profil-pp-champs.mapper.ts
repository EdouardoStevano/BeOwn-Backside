import { CreateProfilPPDto } from 'src/compliance/presentation/http/dto/profil.dto';
import { ChampsDeclaresProfilPP } from 'src/compliance/domain/aggregates/profil-pp';

/**
 * Traduit le DTO HTTP en champs déclarés du domaine.
 *
 * La liste est écrite en toutes lettres plutôt que déduite par un `rest` :
 * ajouter un champ au DTO ne doit pas suffire à le faire entrer dans le
 * domaine, la décision doit se prendre ici.
 *
 * Cette fonction a longtemps eu un second rôle : **écarter** `patrimoineDeclare`
 * et `montantMaxConseille`, que le DTO acceptait sans que rien ne les
 * enregistre. Ils ont quitté le DTO — un champ qu'aucun chemin n'utilise n'a
 * pas à être documenté comme réglable, et le laisser là invitait à croire qu'on
 * peut se fixer son propre plafond PSFP. La garde ne tient donc plus qu'à la
 * liste ci-dessous, ce qui suffit : elle n'a jamais été franchissable
 * autrement.
 */
export function champsDeclaresDepuisDto(
  dto: Partial<CreateProfilPPDto>,
): ChampsDeclaresProfilPP {
  return {
    civilite: dto.civilite,
    dateNaissance: dto.dateNaissance,
    lieuNaissance: dto.lieuNaissance,
    nationalite: dto.nationalite,
    telephone: dto.telephone,
    adresseLigne1: dto.adresseLigne1,
    adresseLigne2: dto.adresseLigne2,
    codePostal: dto.codePostal,
    ville: dto.ville,
    pays: dto.pays,
    profession: dto.profession,
    secteurActivite: dto.secteurActivite,
    pep: dto.pep,
    residenceFiscale: dto.residenceFiscale,
    nif: dto.nif,
  };
}
