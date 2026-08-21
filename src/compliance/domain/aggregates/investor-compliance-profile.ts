import { AdequacyAssessment } from 'src/compliance/domain/entities/adequacy-assessment';
import { KycCase } from 'src/compliance/domain/entities/kyc-case';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';

/**
 * Ce que le classement du questionnaire impose au reste de l'application.
 *
 * Reporté sur le profil personne physique, où le contrôle de plafond à la
 * souscription va le lire — voir {@link InvestorComplianceProfile.classement}.
 */
export interface ClassementPsfp {
  categoriePsfp: CategoriePsfp;
  patrimoineDeclare: number | null;
  montantMaxConseille: number | null;
}

/**
 * Éligibilité réglementaire d'un investisseur : peut-il opérer, et jusqu'où.
 *
 * Racine d'agrégat du contexte (§3.2). Elle réunit les deux pièces qui
 * répondent ensemble à cette question, et qui vivaient jusqu'ici dans deux
 * agrégats indépendants :
 *
 * | Entité                  | Ce qu'elle établit                                  |
 * | ----------------------- | --------------------------------------------------- |
 * | {@link KycCase}         | l'identité est vérifiée — le droit d'opérer          |
 * | {@link AdequacyAssessment} | la catégorie Averti/Non-averti — l'ampleur permise |
 *
 * Les réunir n'est pas un rangement. RG-KYC-13 fait dériver la catégorisation
 * PSFP du questionnaire d'adéquation : la conclusion de l'une est une prémisse
 * de l'autre, et tant qu'elles étaient deux agrégats, ce lien était recopié à
 * la main dans un use case (voir {@link classement}). Deux invariants le
 * demandaient aussi :
 *
 * - **le verdict d'aptitude est une seule règle.** Elle vivait dans
 *   `KycValidatedGuard`, en trois `if` successifs — dossier présent, statut
 *   `VALIDE`, échéance non dépassée — c'est-à-dire une règle métier écrite dans
 *   un adapter d'entrée, que les quatre contextes financiers montaient sans
 *   pouvoir la lire (§14 : la présentation ne décide de rien) ;
 * - **le classement et les réponses qui le fondent ne se séparent pas.** Un
 *   questionnaire enregistré sans que le classement suive laisserait le plafond
 *   de la veille opposable à la souscription du jour.
 *
 * Les deux entités sont **facultatives** : un titulaire qui vient d'ouvrir son
 * compte n'a ni dossier ni questionnaire, et c'est un état normal du parcours
 * d'entrée en relation, pas une anomalie à corriger par un objet vide.
 *
 * Ce que la racine ne porte **pas** : les profils personne physique et morale.
 * Ils vivent dans le même contexte, mais ils ont leur propre cycle de vie — on
 * complète son adresse sans rouvrir son dossier de vérification — et les
 * charger ici ferait un agrégat lourd pour une question qui ne les regarde pas
 * (§6.1). La racine les référence par l'identifiant du titulaire (§6.2).
 */
export class InvestorComplianceProfile {
  private readonly _investorId: number;
  private _kycCase: KycCase | null;
  private _adequacy: AdequacyAssessment | null;

  /**
   * @internal Réservé au repository, qui compose la racine depuis les deux
   * tables. Il n'éprouve rien : les invariants de chaque pièce sont posés par
   * sa propre fabrique.
   */
  constructor(etat: {
    investorId: number;
    kycCase: KycCase | null;
    adequacy: AdequacyAssessment | null;
  }) {
    this._investorId = etat.investorId;
    this._kycCase = etat.kycCase;
    this._adequacy = etat.adequacy;
  }

  /** Titulaire qui n'a encore rien déposé — ni dossier, ni questionnaire. */
  static vierge(investorId: number): InvestorComplianceProfile {
    return new InvestorComplianceProfile({
      investorId,
      kycCase: null,
      adequacy: null,
    });
  }

  // ── Le verdict ────────────────────────────────────────────────────────────

  /**
   * Ce titulaire peut-il réaliser des opérations financières — dépôt,
   * souscription, marché secondaire, retrait ?
   *
   * La vérification d'identité est le signal unique et faisant foi. Trois
   * conditions, et elles sont cumulatives : un dossier existe, il est validé,
   * et sa validité n'est pas périmée. Cette dernière compte autant que les deux
   * autres — un dossier validé il y a trois ans ne prouve plus rien, et le
   * régulateur attend qu'il soit rejoué.
   *
   * @param maintenant injecté pour que la règle s'éprouve sans dépendre de
   *   l'horloge (§26).
   */
  peutOperer(maintenant: Date = new Date()): boolean {
    if (this._kycCase === null) return false;
    if (this._kycCase.statut !== KycStatus.VALIDE) return false;

    const echeance = this._kycCase.valideJusquAu;
    return echeance === null || new Date(echeance) >= maintenant;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Enregistre le passage du questionnaire d'adéquation.
   *
   * L'appelant fournit soit les nouvelles réponses à donner au questionnaire
   * existant, soit — au premier passage — le questionnaire que sa fabrique
   * vient de produire. Dans les deux cas le classement est recalculé par
   * l'entité, jamais déclaré.
   */
  repondreAuQuestionnaire(assessment: AdequacyAssessment): void {
    this._adequacy = assessment;
  }

  /** Ouvre ou remplace le dossier de vérification d'identité. */
  deposerDossierKyc(kycCase: KycCase): void {
    this._kycCase = kycCase;
  }

  // ── Ce que le classement impose ───────────────────────────────────────────

  /**
   * Classement à reporter sur le profil personne physique.
   *
   * `null` tant que le titulaire n'a pas répondu. Le repli sur `NON_AVERTI`
   * protège les lignes anciennes relues sans `resultCategorie` : un classement
   * absent ne doit jamais valoir « averti », qui lèverait les protections.
   *
   * Ce report est **synchrone**, et doit le rester. Il serait tentant d'en
   * faire un abonné à un Domain Event, comme pour les décisions KYC ; ce serait
   * une erreur : `create-investment.usecase` lit la catégorie et le plafond sur
   * le profil pour opposer la limite PSFP. Un report différé, même de peu,
   * laisserait passer une souscription contrôlée avec l'ancien classement.
   */
  get classement(): ClassementPsfp | null {
    if (this._adequacy === null) return null;

    return {
      categoriePsfp: this._adequacy.categoriePsfp ?? CategoriePsfp.NON_AVERTI,
      patrimoineDeclare: this._adequacy.patrimoineNet,
      montantMaxConseille: this._adequacy.montantMaxConseille,
    };
  }

  /** Niveau de suivi appelé par les réponses ; `null` sans questionnaire. */
  niveauSuivi(): NiveauRisque | null {
    return this._adequacy?.niveauRisque() ?? null;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get investorId(): number {
    return this._investorId;
  }
  /** `null` tant que le titulaire n'a pas ouvert de dossier. */
  get kycCase(): KycCase | null {
    return this._kycCase;
  }
  /** `null` tant que le titulaire n'a pas répondu au questionnaire. */
  get adequacy(): AdequacyAssessment | null {
    return this._adequacy;
  }
}
