import { ProfilPP } from 'src/onboarding/domain/aggregates/profil-pp';
// Aliasé : le domaine a lui aussi un mapper de profil, qui traduit entre
// l'agrégat et son snapshot. Celui-ci ne fait que la moitié ORM du chemin et
// délègue l'autre.
import { ProfilPPMapper as ProfilPPDomainMapper } from 'src/onboarding/domain/mappers/profil-pp.mapper';
import { ProfilPMMapper as ProfilPMDomainMapper } from 'src/onboarding/domain/mappers/profil-pm.mapper';
import { ProfilPM } from 'src/onboarding/domain/aggregates/profil-pm';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilPMEntity } from '../entities/profil-pm.entity';

export class ProfilMapper {
  /**
   * Le profil ne traduit plus que ce que le titulaire **déclare** de lui.
   *
   * Le classement PSFP et le suivi de risque passaient par ici, et une partie
   * s'y perdait — `patrimoineDeclare` n'était pas repris, si bien que le
   * plafond retombait sur le plancher de 1 000 € au lieu des 5 % du patrimoine.
   * Ils appartiennent à `EvaluationDAdequation`, qui les tient du
   * questionnaire d'adéquation : il n'y a plus de copie à tenir à jour.
   */
  static ppToDomain(entity: ProfilPPEntity): ProfilPP {
    return ProfilPPDomainMapper.restore({
      id: entity.id,
      userId: entity.userId,
      nomNaissance: entity.nomNaissance,
      civilite: entity.civilite,
      dateNaissance: entity.dateNaissance,
      lieuNaissance: entity.lieuNaissance,
      paysNaissance: entity.paysNaissance,
      nationalite: entity.nationalite,
      telephone: entity.telephone,
      adresseLigne1: entity.adresseLigne1,
      adresseLigne2: entity.adresseLigne2,
      codePostal: entity.codePostal,
      ville: entity.ville,
      pays: entity.pays,
      profession: entity.profession,
      secteurActivite: entity.secteurActivite,
      pep: entity.pep,
      residenceFiscale: entity.residenceFiscale,
      nif: entity.nif,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  /**
   * Sens écriture : **seuls les champs dont l'agrégat est propriétaire**.
   *
   * `patrimoineDeclare`, `montantMaxConseille`, `niveauRisque` et les dates de
   * contact sont relus par `ppToDomain` mais délibérément absents ici. Ils
   * appartiennent à `SaveQuestionnaireUseCase` et `RiskScoringService`, qui
   * écrivent directement sur l'entité ; les recopier depuis le profil ferait
   * qu'une mise à jour d'adresse partie d'un profil chargé avant le
   * questionnaire écraserait le classement calculé entre-temps. Les laisser
   * `undefined` dit à TypeORM de ne pas toucher à la colonne.
   */
  static ppToEntity(domain: ProfilPP): ProfilPPEntity {
    const snapshot = ProfilPPDomainMapper.toSnapshot(domain);
    const entity = new ProfilPPEntity();
    // `undefined` sur un profil qui n'a jamais été écrit : TypeORM insère et
    // attribue l'uuid. Renseigné, il désigne la ligne à mettre à jour.
    entity.id = snapshot.id;
    entity.userId = snapshot.userId;
    entity.nomNaissance = snapshot.nomNaissance;
    entity.civilite = snapshot.civilite;
    // Une colonne Postgres `date` se renseigne aussi bien avec la chaîne
    // civile `AAAA-MM-JJ` qu'avec un `Date` — et c'est cette chaîne que le
    // driver rend à la lecture, malgré le type déclaré sur l'entité.
    entity.dateNaissance = snapshot.dateNaissance as unknown as Date | null;
    entity.lieuNaissance = snapshot.lieuNaissance;
    entity.paysNaissance = snapshot.paysNaissance;
    entity.nationalite = snapshot.nationalite;
    entity.telephone = snapshot.telephone;
    entity.adresseLigne1 = snapshot.adresseLigne1;
    entity.adresseLigne2 = snapshot.adresseLigne2;
    entity.codePostal = snapshot.codePostal;
    entity.ville = snapshot.ville;
    entity.pays = snapshot.pays;
    entity.profession = snapshot.profession;
    entity.secteurActivite = snapshot.secteurActivite;
    entity.pep = snapshot.pep;
    entity.residenceFiscale = snapshot.residenceFiscale;
    entity.nif = snapshot.nif;
    return entity;
  }

  static pmToDomain(entity: ProfilPMEntity): ProfilPM {
    return ProfilPMDomainMapper.restore({
      id: entity.id,
      userId: entity.userId,
      raisonSociale: entity.raisonSociale,
      formeJuridique: entity.formeJuridique,
      siren: entity.siren,
      rcsVille: entity.rcsVille,
      capitalSocial: entity.capitalSocial,
      siegeAdresse: entity.siegeAdresse,
      representantId: entity.representantId,
      secteurActivite: entity.secteurActivite,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static pmToEntity(domain: ProfilPM): ProfilPMEntity {
    const snapshot = ProfilPMDomainMapper.toSnapshot(domain);
    const entity = new ProfilPMEntity();
    // Cf. `ppToEntity` : absent tant que la ligne n'a pas été écrite.
    entity.id = snapshot.id;
    entity.userId = snapshot.userId;
    entity.raisonSociale = snapshot.raisonSociale;
    entity.formeJuridique = snapshot.formeJuridique;
    entity.siren = snapshot.siren;
    entity.rcsVille = snapshot.rcsVille;
    entity.capitalSocial = snapshot.capitalSocial;
    entity.siegeAdresse = snapshot.siegeAdresse;
    entity.representantId = snapshot.representantId;
    entity.secteurActivite = snapshot.secteurActivite;
    return entity;
  }
}
