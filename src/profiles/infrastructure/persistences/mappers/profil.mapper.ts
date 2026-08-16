import { ProfilPP } from 'src/profiles/domains/profil-pp';
// Aliasé : le domaine a lui aussi un mapper de profil, qui traduit entre
// l'agrégat et son snapshot. Celui-ci ne fait que la moitié ORM du chemin et
// délègue l'autre.
import { ProfilPPMapper as ProfilPPDomainMapper } from 'src/profiles/domains/mappers/profil-pp.mapper';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { Kyc } from 'src/profiles/domains/kyc';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilPMEntity } from '../entities/profil-pm.entity';
import { KycEntity } from '../entities/kyc.entity';

export class ProfilMapper {
  /**
   * `paysNaissance`, `patrimoineDeclare`, `montantMaxConseille`,
   * `niveauRisque` et les dates de contact étaient absents de cette
   * traduction : la colonne existait, l'agrégat aussi, mais la valeur se
   * perdait entre les deux. La conséquence la plus visible touchait le plafond
   * PSFP — `create-investment.usecase` lisait `profilPP.patrimoineDeclare`,
   * toujours `undefined`, et retombait donc systématiquement sur le plancher
   * de 1 000 € au lieu des 5 % du patrimoine déclaré.
   */
  static ppToDomain(entity: ProfilPPEntity): ProfilPP {
    return ProfilPPDomainMapper.restore({
      utilisateurId: entity.utilisateurId,
      prenom: entity.prenom,
      nom: entity.nom,
      nomNaissance: entity.nomNaissance,
      civilite: entity.civilite,
      dateNaissance: entity.dateNaissance,
      lieuNaissance: entity.lieuNaissance,
      paysNaissance: entity.paysNaissance,
      nationalite: entity.nationalite,
      adresseLigne1: entity.adresseLigne1,
      adresseLigne2: entity.adresseLigne2,
      codePostal: entity.codePostal,
      ville: entity.ville,
      pays: entity.pays,
      telephone: entity.telephone,
      profession: entity.profession,
      secteurActivite: entity.secteurActivite,
      pep: entity.pep,
      residenceFiscale: entity.residenceFiscale,
      nif: entity.nif,
      categoriePsfp: entity.categoriePsfp,
      patrimoineDeclare: entity.patrimoineDeclare,
      montantMaxConseille: entity.montantMaxConseille,
      niveauRisque: entity.niveauRisque,
      dernierContactAdmin: entity.dernierContactAdmin,
      prochainContactDu: entity.prochainContactDu,
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
    entity.utilisateurId = snapshot.utilisateurId;
    entity.prenom = snapshot.prenom;
    entity.nom = snapshot.nom;
    entity.nomNaissance = snapshot.nomNaissance;
    entity.civilite = snapshot.civilite;
    // Une colonne Postgres `date` se renseigne aussi bien avec la chaîne
    // civile `AAAA-MM-JJ` qu'avec un `Date` — et c'est cette chaîne que le
    // driver rend à la lecture, malgré le type déclaré sur l'entité.
    entity.dateNaissance = snapshot.dateNaissance as unknown as Date | null;
    entity.lieuNaissance = snapshot.lieuNaissance;
    entity.paysNaissance = snapshot.paysNaissance;
    entity.nationalite = snapshot.nationalite;
    entity.adresseLigne1 = snapshot.adresseLigne1;
    entity.adresseLigne2 = snapshot.adresseLigne2;
    entity.codePostal = snapshot.codePostal;
    entity.ville = snapshot.ville;
    entity.pays = snapshot.pays;
    entity.telephone = snapshot.telephone;
    entity.profession = snapshot.profession;
    entity.secteurActivite = snapshot.secteurActivite;
    entity.pep = snapshot.pep;
    entity.residenceFiscale = snapshot.residenceFiscale;
    entity.nif = snapshot.nif;
    entity.categoriePsfp = snapshot.categoriePsfp;
    return entity;
  }

  static pmToDomain(entity: ProfilPMEntity): ProfilPM {
    const domain = new ProfilPM();
    domain.utilisateurId = entity.utilisateurId;
    domain.raisonSociale = entity.raisonSociale;
    domain.formeJuridique = entity.formeJuridique;
    domain.siren = entity.siren;
    domain.rcsVille = entity.rcsVille;
    domain.capitalSocial = entity.capitalSocial;
    domain.siegeAdresse = entity.siegeAdresse;
    domain.representantId = entity.representantId;
    domain.secteurActivite = entity.secteurActivite;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static pmToEntity(domain: ProfilPM): ProfilPMEntity {
    const entity = new ProfilPMEntity();
    entity.utilisateurId = domain.utilisateurId;
    entity.raisonSociale = domain.raisonSociale;
    entity.formeJuridique = domain.formeJuridique;
    entity.siren = domain.siren;
    entity.rcsVille = domain.rcsVille;
    entity.capitalSocial = domain.capitalSocial;
    entity.siegeAdresse = domain.siegeAdresse;
    entity.representantId = domain.representantId;
    entity.secteurActivite = domain.secteurActivite;
    return entity;
  }

  static kycToDomain(entity: KycEntity): Kyc {
    const domain = new Kyc();
    domain.id = entity.id;
    domain.utilisateurId = entity.utilisateurId;
    domain.statut = entity.statut;
    domain.niveau = entity.niveau;
    domain.scoreRisque = entity.scoreRisque;
    domain.fournisseur = entity.fournisseur;
    domain.fournisseurRef = entity.fournisseurRef;
    domain.valideJusquAu = entity.valideJusquAu;
    domain.motifRefus = entity.motifRefus;
    domain.stripeReportId = (entity as any).stripeReportId ?? null;
    domain.identiteExtrait = (entity as any).identiteExtrait ?? null;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    if (entity.utilisateur) {
      domain.utilisateur = {
        userId: entity.utilisateur.userId,
        firstname: entity.utilisateur.firstname ?? undefined,
        lastname: entity.utilisateur.lastname ?? undefined,
        role: entity.utilisateur.role,
        status: entity.utilisateur.status,
        createdAt: entity.utilisateur.createdAt,
        userEmail: entity.utilisateur.userEmail
          ? { email: entity.utilisateur.userEmail.email }
          : undefined,
      };
    }
    return domain;
  }

  static kycToEntity(domain: Kyc): KycEntity {
    const entity = new KycEntity();
    if (domain.id) entity.id = domain.id;
    entity.utilisateurId = domain.utilisateurId;
    entity.statut = domain.statut;
    entity.niveau = domain.niveau;
    entity.scoreRisque = domain.scoreRisque;
    entity.fournisseur = domain.fournisseur;
    entity.fournisseurRef = domain.fournisseurRef;
    entity.valideJusquAu = domain.valideJusquAu;
    entity.motifRefus = domain.motifRefus;
    return entity;
  }
}
