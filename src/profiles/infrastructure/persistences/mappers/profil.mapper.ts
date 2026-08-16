import { ProfilPP } from 'src/profiles/domains/profil-pp';
// Aliasé : le domaine a lui aussi un mapper de profil, qui traduit entre
// l'agrégat et son snapshot. Celui-ci ne fait que la moitié ORM du chemin et
// délègue l'autre.
import { ProfilPPMapper as ProfilPPDomainMapper } from 'src/profiles/domains/mappers/profil-pp.mapper';
import { ProfilPMMapper as ProfilPMDomainMapper } from 'src/profiles/domains/mappers/profil-pm.mapper';
import { KycMapper as KycDomainMapper } from 'src/profiles/domains/mappers/kyc.mapper';
import { QuestionnaireAdequationMapper as QuestionnaireAdequationDomainMapper } from 'src/profiles/domains/mappers/questionnaire-adequation.mapper';
import { QuestionnaireAdequation } from 'src/profiles/domains/questionnaire-adequation';
import { ProfilPM } from 'src/profiles/domains/profil-pm';
import { Kyc } from 'src/profiles/domains/kyc';
import { ProfilPPEntity } from '../entities/profil-pp.entity';
import { ProfilPMEntity } from '../entities/profil-pm.entity';
import { KycEntity } from '../entities/kyc.entity';
import { QuestionnaireAdequationEntity } from '../entities/questionnaire-adequation.entity';

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
    return ProfilPMDomainMapper.restore({
      utilisateurId: entity.utilisateurId,
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
    entity.utilisateurId = snapshot.utilisateurId;
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

  static questionnaireToDomain(
    entity: QuestionnaireAdequationEntity,
  ): QuestionnaireAdequation {
    return QuestionnaireAdequationDomainMapper.restore({
      id: entity.id,
      utilisateurId: entity.utilisateurId,
      workInFinancialSector: entity.workInFinancialSector,
      moreThan10TransactionsPerQuarter: entity.moreThan10TransactionsPerQuarter,
      portfolioOver500k: entity.portfolioOver500k,
      previousUnlistedInvestments: entity.previousUnlistedInvestments,
      investmentExperienceOver5Years: entity.investmentExperienceOver5Years,
      financialPatrimonyOver500k: entity.financialPatrimonyOver500k,
      understandsTotalLossRisk: entity.understandsTotalLossRisk,
      financialSectorBackground: entity.financialSectorBackground,
      patrimoineNet: entity.patrimoineNet,
      revenuAnnuel: entity.revenuAnnuel,
      budgetAnnuelInvestissement: entity.budgetAnnuelInvestissement,
      acceptsSimulatedLoss: entity.acceptsSimulatedLoss,
      resultCategorie: entity.resultCategorie,
      resultMontantMaxConseille: entity.resultMontantMaxConseille,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  /**
   * Sens écriture : tout l'état du questionnaire, classement compris.
   *
   * Contrairement au profil, l'agrégat est ici **propriétaire de toutes ses
   * colonnes** — y compris `resultCategorie` et `resultMontantMaxConseille`,
   * que personne d'autre n'écrit : ils sont déduits des réponses par
   * `ResultatAdequation.calculer`. C'est le questionnaire qui les reporte
   * ensuite sur le profil, via `enregistrerClassementPsfp`.
   */
  static questionnaireToEntity(
    domain: QuestionnaireAdequation,
  ): QuestionnaireAdequationEntity {
    const snapshot = QuestionnaireAdequationDomainMapper.toSnapshot(domain);
    const entity = new QuestionnaireAdequationEntity();
    // Absent d'un premier passage : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.utilisateurId = snapshot.utilisateurId;
    entity.workInFinancialSector = snapshot.workInFinancialSector;
    entity.moreThan10TransactionsPerQuarter =
      snapshot.moreThan10TransactionsPerQuarter;
    entity.portfolioOver500k = snapshot.portfolioOver500k;
    entity.previousUnlistedInvestments = snapshot.previousUnlistedInvestments;
    entity.investmentExperienceOver5Years =
      snapshot.investmentExperienceOver5Years;
    entity.financialPatrimonyOver500k = snapshot.financialPatrimonyOver500k;
    entity.understandsTotalLossRisk = snapshot.understandsTotalLossRisk;
    entity.financialSectorBackground = snapshot.financialSectorBackground;
    entity.patrimoineNet = snapshot.patrimoineNet;
    entity.revenuAnnuel = snapshot.revenuAnnuel;
    entity.budgetAnnuelInvestissement = snapshot.budgetAnnuelInvestissement;
    entity.acceptsSimulatedLoss = snapshot.acceptsSimulatedLoss;
    entity.resultCategorie = snapshot.resultCategorie;
    entity.resultMontantMaxConseille = snapshot.resultMontantMaxConseille;
    return entity;
  }

  static kycToDomain(entity: KycEntity): Kyc {
    return KycDomainMapper.restore({
      id: entity.id,
      utilisateurId: entity.utilisateurId,
      statut: entity.statut,
      niveau: entity.niveau,
      scoreRisque: entity.scoreRisque,
      fournisseur: entity.fournisseur,
      fournisseurRef: entity.fournisseurRef,
      valideJusquAu: entity.valideJusquAu,
      motifRefus: entity.motifRefus,
      stripeReportId: entity.stripeReportId,
      identiteExtrait: entity.identiteExtrait,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      // Chargé par le seul `findAll` du repository (liste admin) — voir
      // `TitulaireKyc`.
      utilisateur: entity.utilisateur
        ? {
            userId: entity.utilisateur.userId,
            firstname: entity.utilisateur.firstname ?? undefined,
            lastname: entity.utilisateur.lastname ?? undefined,
            role: entity.utilisateur.role,
            status: entity.utilisateur.status,
            createdAt: entity.utilisateur.createdAt,
            userEmail: entity.utilisateur.userEmail
              ? { email: entity.utilisateur.userEmail.email }
              : undefined,
          }
        : undefined,
    });
  }

  /**
   * Sens écriture : **seuls les champs dont l'agrégat est propriétaire**.
   *
   * `stripeReportId` et `identiteExtrait` sont relus par `kycToDomain` mais
   * délibérément absents ici — comme pour `ppToEntity`. Ils appartiennent à
   * `updateReportData`, que le webhook Stripe appelle avec les données du
   * rapport de vérification ; les recopier depuis un dossier chargé avant le
   * webhook écraserait ce que celui-ci vient d'écrire. Les laisser `undefined`
   * dit à TypeORM de ne pas toucher à la colonne.
   */
  static kycToEntity(domain: Kyc): KycEntity {
    const snapshot = KycDomainMapper.toSnapshot(domain);
    const entity = new KycEntity();
    // Absent d'un dossier qui vient de naître : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.utilisateurId = snapshot.utilisateurId;
    entity.statut = snapshot.statut;
    entity.niveau = snapshot.niveau;
    entity.scoreRisque = snapshot.scoreRisque;
    entity.fournisseur = snapshot.fournisseur;
    entity.fournisseurRef = snapshot.fournisseurRef;
    // Une colonne Postgres `date` se renseigne aussi bien avec la chaîne civile
    // `AAAA-MM-JJ` qu'avec un `Date` — et c'est cette chaîne que le driver rend
    // à la lecture, malgré le type déclaré sur l'entité (cf. `ppToEntity`).
    entity.valideJusquAu = snapshot.valideJusquAu as unknown as Date | null;
    entity.motifRefus = snapshot.motifRefus;
    return entity;
  }
}
