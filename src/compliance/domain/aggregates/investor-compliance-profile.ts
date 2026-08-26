import {
  AdequacyAssessment,
  AdequacyAssessmentSnapshot,
  ReponsesQuestionnaire,
} from 'src/compliance/domain/entities/adequacy-assessment';
import { QuestionnaireAdequationFactory } from 'src/compliance/domain/factories/questionnaire-adequation.factory';
import {
  KycCase,
  KycCaseSnapshot,
  KycIdentiteExtrait,
} from 'src/compliance/domain/entities/kyc-case';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import {
  SuiteDuVerdict,
  VerdictIdentite,
} from 'src/compliance/domain/value-objects/verdict-identite';
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
   * **Un titulaire n'a qu'un questionnaire** : repasser le formulaire remplace
   * ses réponses et son classement, il n'en crée pas un second. Cette règle
   * était écrite dans le use case, qui lisait le questionnaire existant sur la
   * racine, le mutait, puis le lui rendait — un aller-retour qui n'avait de
   * sens que parce que l'entité sortait. Elle est ici, où elle vaut pour tout
   * appelant.
   *
   * Le classement, lui, est recalculé par l'entité à chaque passage, jamais
   * déclaré : c'est ce qui interdit de se prétendre « averti ».
   */
  repondreAuQuestionnaire(reponses: ReponsesQuestionnaire): void {
    if (this._adequacy !== null) {
      this._adequacy.repondre(reponses);
      return;
    }

    this._adequacy = QuestionnaireAdequationFactory.repondre({
      utilisateurId: this._investorId,
      ...reponses,
    });
  }

  /** Ouvre ou remplace le dossier de vérification d'identité. */
  deposerDossierKyc(kycCase: KycCase): void {
    this._kycCase = kycCase;
  }

  /**
   * Les trois gestes du parcours de vérification, relayés à la pièce qui les
   * porte.
   *
   * Ce relais est la raison d'être d'une racine (§6) : `KycCase` est une
   * **entité interne**, elle n'a ni port ni existence hors de ce dossier.
   * L'application manipulait auparavant chacune de ses colonnes par des
   * `UPDATE` ciblés, ce qui revenait à écrire dans une pièce sans passer par
   * son propriétaire — et rendait impossible d'opposer, un jour, une règle qui
   * lise les deux pièces à la fois.
   *
   * Chacun est sans effet si le titulaire n'a pas encore de dossier : c'est un
   * état normal du parcours, pas une erreur à lever.
   */
  rattacherSessionDeVerification(sessionId: string, fournisseur: string): void {
    this._kycCase?.rattacherSession(sessionId, fournisseur);
  }

  changerStatutKyc(statut: KycStatus, motif?: string | null): void {
    this._kycCase?.changerStatut(statut, motif);
  }

  enregistrerRapportKyc(reportId: string, identite: KycIdentiteExtrait): void {
    this._kycCase?.enregistrerRapport(reportId, identite);
  }

  /**
   * Que faire du verdict que le fournisseur vient de rendre ?
   *
   * `ECARTE` quand il n'y a pas de dossier : un verdict qui ne se rattache à
   * rien ne s'applique à rien.
   */
  accueillirVerdict(
    verdict: VerdictIdentite,
    sessionRendue: string | null,
  ): SuiteDuVerdict {
    return (
      this._kycCase?.accueille(verdict, sessionRendue) ?? SuiteDuVerdict.ECARTE
    );
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

  // Ce que la racine publie de ses pièces, ce sont des **valeurs**.
  //
  // Elle rendait `KycCase` et `AdequacyAssessment` par deux getters, si bien
  // que l'application, la présentation et jusqu'au contexte `iam` tenaient une
  // entité interne et pouvaient en appeler les transitions. Une racine qui
  // tend ses pièces ne protège plus rien (§6) : ce qui sort désormais ne se
  // modifie pas.

  /** `false` tant que le titulaire n'a pas ouvert de dossier. */
  aUnDossierKyc(): boolean {
    return this._kycCase !== null;
  }

  /** Identifiant du dossier de vérification, `null` s'il n'y en a pas. */
  get dossierKycId(): string | null {
    return this._kycCase?.id ?? null;
  }

  /** `null` tant qu'aucun dossier n'existe — distinct de `NON_DEMARRE`. */
  get statutKyc(): KycStatus | null {
    return this._kycCase?.statut ?? null;
  }

  /** Ce qui explique un refus ou une mise en revue, `null` sinon. */
  get motifRefusKyc(): string | null {
    return this._kycCase?.motifRefus ?? null;
  }

  /** Session ouverte chez le fournisseur, `null` s'il n'y en a aucune. */
  get sessionDeVerification(): string | null {
    return this._kycCase?.fournisseurRef ?? null;
  }

  /** Le dossier est-il suspendu à une décision humaine ? */
  estEnRevueManuelle(): boolean {
    return this._kycCase?.estEnRevueManuelle() ?? false;
  }

  /** `false` tant que le titulaire n'a pas répondu au questionnaire. */
  aReponduAuQuestionnaire(): boolean {
    return this._adequacy !== null;
  }

  /**
   * Le dossier de vérification tel qu'il se publie — des primitives, pas
   * l'entité. Même raison que {@link questionnairePublie}.
   */
  get dossierKycPublie(): KycCaseSnapshot | null {
    return this._kycCase?.toJSON() ?? null;
  }

  /**
   * Le questionnaire tel qu'il se publie — des primitives, pas l'entité.
   *
   * C'est la réponse de `POST /profiles/questionnaire` et de
   * `GET /profiles/questionnaire/me`. Rendre l'entité donnerait au contrôleur
   * de quoi appeler `repondre()` sans passer par cette racine.
   */
  get questionnairePublie(): AdequacyAssessmentSnapshot | null {
    return this._adequacy?.toJSON() ?? null;
  }

  /**
   * @internal Réservé au repository de la racine, qui répartit les deux pièces
   * entre leurs deux tables.
   *
   * Public faute de mieux — TypeScript n'a pas de classe amie. C'est **une**
   * porte, nommée et documentée, là où deux getters ordinaires (`kycCase`,
   * `adequacy`) se lisaient comme une API et étaient consommés comme telle,
   * jusque depuis le contexte `iam`. Y passer, c'est se déclarer repository.
   */
  get pieces(): {
    kycCase: KycCase | null;
    adequacy: AdequacyAssessment | null;
  } {
    return { kycCase: this._kycCase, adequacy: this._adequacy };
  }
}
