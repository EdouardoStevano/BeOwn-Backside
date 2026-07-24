import { ProfilPP } from 'src/profiles/domains/profil-pp';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { Kyc } from 'src/profiles/domains/kyc';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilPMEntity } from '../entities/profil-pm.entity';
import { KycEntity } from '../entities/kyc.entity';

export class ProfilMapper {
  static ppToDomain(entity: ProfilPPEntity): ProfilPP {
    const domain = new ProfilPP();
    domain.utilisateurId = entity.utilisateurId;
    domain.prenom = entity.prenom;
    domain.nom = entity.nom;
    domain.nomNaissance = entity.nomNaissance;
    domain.civilite = entity.civilite;
    domain.dateNaissance = entity.dateNaissance;
    domain.lieuNaissance = entity.lieuNaissance;
    domain.nationalite = entity.nationalite;
    domain.adresseLigne1 = entity.adresseLigne1;
    domain.adresseLigne2 = entity.adresseLigne2;
    domain.codePostal = entity.codePostal;
    domain.ville = entity.ville;
    domain.pays = entity.pays;
    domain.telephone = entity.telephone;
    domain.profession = entity.profession;
    domain.secteurActivite = entity.secteurActivite;
    domain.pep = entity.pep;
    domain.residenceFiscale = entity.residenceFiscale;
    domain.nif = entity.nif;
    domain.categoriePsfp = entity.categoriePsfp;
    domain.createdAt = entity.createdAt;
    domain.updatedAt = entity.updatedAt;
    return domain;
  }

  static ppToEntity(domain: ProfilPP): ProfilPPEntity {
    const entity = new ProfilPPEntity();
    entity.utilisateurId = domain.utilisateurId;
    entity.prenom = domain.prenom;
    entity.nom = domain.nom;
    entity.nomNaissance = domain.nomNaissance;
    entity.civilite = domain.civilite;
    entity.dateNaissance = domain.dateNaissance;
    entity.lieuNaissance = domain.lieuNaissance;
    entity.nationalite = domain.nationalite;
    entity.adresseLigne1 = domain.adresseLigne1;
    entity.adresseLigne2 = domain.adresseLigne2;
    entity.codePostal = domain.codePostal;
    entity.ville = domain.ville;
    entity.pays = domain.pays;
    entity.telephone = domain.telephone;
    entity.profession = domain.profession;
    entity.secteurActivite = domain.secteurActivite;
    entity.pep = domain.pep;
    entity.residenceFiscale = domain.residenceFiscale;
    entity.nif = domain.nif;
    entity.categoriePsfp = domain.categoriePsfp;
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
