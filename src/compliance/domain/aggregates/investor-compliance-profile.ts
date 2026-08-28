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
import {
  ClassementPsfp,
  ClassementPsfpSnapshot,
} from 'src/compliance/domain/value-objects/classement-psfp.vo';
import { EtapeQuestionnaire } from 'src/compliance/domain/enums/etape-questionnaire.enum';
import { ProfilInvestisseur } from 'src/compliance/domain/value-objects/profil-investisseur.vo';
import {
  EtapeQuestionnaireFermeeError,
  KybNeConcernePasUnePersonnePhysiqueError,
} from 'src/compliance/domain/errors';
import {
  DecisionKyb,
  DecisionKybSnapshot,
} from 'src/compliance/domain/value-objects/decision-kyb.vo';
import { StatutKyb } from 'src/compliance/domain/enums/statut-kyb.enum';
import { KycStatus } from 'src/compliance/domain/enums/kyc-status.enum';
import { ChampsPreQualification } from 'src/compliance/domain/value-objects/pre-qualification-psfp.vo';
import { ChampsQualification } from 'src/compliance/domain/value-objects/qualification-psfp.vo';
import { ChampsCapaciteDePerte } from 'src/compliance/domain/value-objects/capacite-de-perte.vo';
import {
  SuiteDuVerdict,
  VerdictIdentite,
} from 'src/compliance/domain/value-objects/verdict-identite';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import {
  SuiviInvestisseur,
  SuiviInvestisseurSnapshot,
} from 'src/compliance/domain/value-objects/suivi-investisseur.vo';

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
 * S'y ajoute {@link DecisionKyb}, qui répond à la même question — le droit
 * d'opérer — mais pour l'autre nature de souscripteur : une société n'a pas
 * d'identité à vérifier, elle a un dossier de justificatifs instruit par
 * l'équipe conformité. Un Value Object et non une entité (cinq attributs, pas
 * d'identité propre), rangé en colonnes à plat comme {@link ClassementPsfp} et
 * {@link SuiviInvestisseur}. Les deux signaux ne coexistent jamais sur une même
 * ligne : `souscripteur` décide lequel fait foi, et {@link peutOperer} ne lit
 * que celui-là.
 *
 * Ce que la racine ne porte **pas** : les profils personne physique et morale.
 * Ils vivent dans le même contexte, mais ils ont leur propre cycle de vie — on
 * complète son adresse sans rouvrir son dossier de vérification — et les
 * charger ici ferait un agrégat lourd pour une question qui ne les regarde pas
 * (§6.1). La racine les référence par l'identifiant du titulaire (§6.2).
 */
export class InvestorComplianceProfile {
  private readonly _id: string;
  private readonly _investorId: number;
  private readonly _souscripteur: ProfilInvestisseur;
  private _kycCase: KycCase | null;
  private _adequacy: AdequacyAssessment | null;
  private _classement: ClassementPsfp;
  private _suivi: SuiviInvestisseur;
  private _kyb: DecisionKyb;

  /**
   * @internal Réservé au repository, qui compose la racine depuis les deux
   * tables. Il n'éprouve rien : les invariants de chaque pièce sont posés par
   * sa propre fabrique.
   */
  constructor(etat: {
    /** Attribuée par la persistance : absente d'un dossier jamais écrit. */
    id?: string;
    investorId: number;
    /**
     * Au nom de qui ce dossier vaut. Par défaut le titulaire lui-même, ce qui
     * est le cas de toutes les lignes écrites avant que les sociétés aient leur
     * propre classement.
     */
    souscripteur?: ProfilInvestisseur;
    kycCase: KycCase | null;
    adequacy: AdequacyAssessment | null;
    classement?: ClassementPsfp;
    suivi?: SuiviInvestisseur;
    /**
     * Le dossier KYB de la société. Absent du dossier d'un titulaire, et de
     * toute ligne écrite avant que ces colonnes n'existent : dans les deux cas
     * le repli est `EN_CONSTITUTION`, jamais une validité présumée.
     */
    kyb?: DecisionKyb;
  }) {
    this._id = etat.id as string;
    this._investorId = etat.investorId;
    this._souscripteur =
      etat.souscripteur ?? ProfilInvestisseur.personnePhysique();
    this._kycCase = etat.kycCase;
    this._adequacy = etat.adequacy;
    this._classement = etat.classement ?? ClassementPsfp.initial();
    this._suivi = etat.suivi ?? SuiviInvestisseur.jamaisEvalue();
    this._kyb = etat.kyb ?? DecisionKyb.initiale();
  }

  /**
   * Titulaire qui n'a encore rien déposé — ni dossier, ni questionnaire.
   *
   * `id` reste vide : il est attribué par la persistance, comme pour les
   * autres agrégats du contexte. Un dossier qui n'a jamais été écrit n'a pas
   * encore d'identité.
   */
  static vierge(
    investorId: number,
    souscripteur: ProfilInvestisseur = ProfilInvestisseur.personnePhysique(),
  ): InvestorComplianceProfile {
    return new InvestorComplianceProfile({
      investorId,
      souscripteur,
      kycCase: null,
      adequacy: null,
    });
  }

  /**
   * Au nom de qui ce dossier vaut : le titulaire, ou l'une de ses sociétés.
   *
   * Le classement PSFP s'apprécie sur l'investisseur, pas sur le compte — une
   * SAS peut être professionnelle quand son dirigeant est non-averti. Le
   * **KYC**, lui, ne vit que sur le dossier du titulaire : une société n'a pas
   * d'identité à vérifier, elle a un KYB (`DossierDePieces`) et un représentant
   * dont l'identité vaut pour toutes ses sociétés.
   */
  get souscripteur(): ProfilInvestisseur {
    return this._souscripteur;
  }

  // ── Le classement réglementaire ───────────────────────────────────────────
  //
  // Ces trois règles vivaient sur `ProfilPP`, dans un bloc
  // `EvaluationInvestisseur` alimenté par recopie du questionnaire. Deux
  // défauts : le profil paraissait propriétaire d'un classement qu'il ne
  // calculait pas, et **une personne morale n'a pas de profil PP** — elle
  // n'était donc catégorisée nulle part, et `subscription` ne lui opposait
  // aucun plafond. Ici, la racine est clé sur le titulaire, quelle que soit sa
  // nature.

  /**
   * Investisseur non averti au sens PSFP : plafond conseillé et délai de
   * rétractation de quatre jours s'appliquent.
   *
   * Un titulaire qui n'a pas répondu au questionnaire **est** non averti : le
   * classement se gagne, il ne se présume pas. C'est aussi le repli que
   * `classement` applique aux lignes anciennes.
   */
  estNonAverti(): boolean {
    return this._classement.estNonAverti();
  }

  estProfessionnel(): boolean {
    return this._classement.estProfessionnel();
  }

  /**
   * Montant conseillé par investissement : le plus élevé du plancher
   * réglementaire et de 5 % du patrimoine déclaré. `null` pour qui n'est pas
   * non averti — la recommandation ne le concerne pas.
   *
   * C'était ici un `if` sur la catégorie, suivi d'un accès à un patrimoine que
   * deux catégories sur trois n'ont jamais. Le classement répond désormais
   * lui-même : `NonAvertiPsfp` applique la formule, les deux autres rendent
   * `null` parce qu'elles n'ont rien à conseiller.
   */
  plafondConseille(): number | null {
    return this._classement.plafondConseille();
  }

  // ── La surveillance périodique ────────────────────────────────────────────

  /**
   * Enregistre le niveau de risque et la date du prochain contact.
   *
   * Le niveau vient des réponses ({@link niveauSuivi}), mais il est **figé**
   * ici : la cadence de contact ne doit pas changer sous les pieds de l'équipe
   * conformité entre deux passages du CRON parce qu'un questionnaire a été
   * modifié entre-temps.
   */
  reevaluerLeSuivi(niveauRisque: NiveauRisque, prochainContactDu: Date): void {
    this._suivi = this._suivi.reevalue(niveauRisque, prochainContactDu);
  }

  /** Le contact périodique de ce titulaire est-il dû ? */
  contactEstDu(maintenant: Date = new Date()): boolean {
    return this._suivi.contactEstDu(maintenant);
  }

  get suivi(): SuiviInvestisseurSnapshot {
    return this._suivi.toSnapshot();
  }

  // ── Le verdict ────────────────────────────────────────────────────────────

  /**
   * Ce souscripteur peut-il réaliser des opérations financières — dépôt,
   * souscription, marché secondaire, retrait ?
   *
   * **La réponse dépend de sa nature, parce que les deux ne prouvent pas la
   * même chose.** Un titulaire prouve son identité ; une société n'en a pas à
   * prouver — elle prouve son existence légale et qui la contrôle, par un
   * dossier de justificatifs instruit par l'équipe conformité :
   *
   * | Souscripteur      | Signal faisant foi                       |
   * | ----------------- | ---------------------------------------- |
   * | personne physique | {@link KycCase} — vérification d'identité |
   * | société           | {@link DecisionKyb} — dossier KYB         |
   *
   * La méthode ne rendait auparavant que le premier verdict, ce qui la rendait
   * **structurellement fausse sur une ligne de société** : le repository n'y
   * charge délibérément aucun `KycCase` — une société n'a pas d'identité à
   * vérifier — donc elle y répondait toujours `false`. Aucun appelant ne la
   * posait à une société, et c'est précisément le trou que la décision KYB
   * comble : le verdict existait, mais recomposé à chaque lecture par
   * `aptitudeDeLaSociete`, sans date ni auteur.
   *
   * Ce que cette méthode **ne dit pas**, et ne peut pas dire : qu'une société
   * ne signe pas elle-même. Le KYC de son représentant légal est une condition
   * supplémentaire, portée par une *autre* racine — celle du titulaire — donc
   * hors de cette frontière transactionnelle (§17). C'est
   * `aptitudeDeLaSociete` qui compose les deux verdicts, et c'est tout ce qui
   * doit lui rester à faire.
   *
   * @param maintenant injecté pour que la règle s'éprouve sans dépendre de
   *   l'horloge (§26).
   */
  peutOperer(maintenant: Date = new Date()): boolean {
    return this._souscripteur.estSociete()
      ? this._kyb.estValide(maintenant)
      : this.identiteEstVerifiee(maintenant);
  }

  /**
   * Trois conditions cumulatives : un dossier existe, il est validé, et sa
   * validité n'est pas périmée. La dernière compte autant que les deux autres —
   * un dossier validé il y a trois ans ne prouve plus rien, et le régulateur
   * attend qu'il soit rejoué.
   */
  private identiteEstVerifiee(maintenant: Date): boolean {
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
    } else {
      this._adequacy = QuestionnaireAdequationFactory.repondre(reponses);
    }

    // Le classement est **repris ici, dans le même geste**. C'était un report
    // fait après coup par le use case, vers une autre table, avec le décalage
    // que cela suppose : un questionnaire enregistré sans que le classement
    // suive laissait le plafond de la veille opposable à la souscription du
    // jour. Les deux ne se séparent plus.
    this.reprendreLeClassement();
  }

  // ── Le questionnaire, étape par étape ─────────────────────────────────────
  //
  // Le formulaire arrivait entier, par une seule route : le front recevait les
  // trois étapes d'un coup et devait deviner seul laquelle poser, en
  // réappliquant des seuils réglementaires que seul le domaine connaît. Ces
  // trois transitions les exposent une par une, et `etapeSuivante` dit laquelle
  // vient — ce n'est plus au client de l'inférer.
  //
  // Chacune est un **relais** vers la pièce qui porte la règle, comme les trois
  // gestes du parcours de vérification plus haut : la racine n'ajoute que ce
  // que la pièce ne peut pas savoir — qu'un questionnaire existe, et que
  // l'étape demandée est bien ouverte.

  /** Étape 1 — pré-qualification : professionnel, ou non. */
  repondreALaPreQualification(
    champs: ChampsPreQualification,
    maintenant: Date = new Date(),
  ): void {
    this.repondreAlEtape(
      EtapeQuestionnaire.PRE_QUALIFICATION,
      (questionnaire) =>
        questionnaire.repondreALaPreQualification(champs, maintenant),
    );
  }

  /** Étape 2 — qualification : averti, ou non. */
  repondreALaQualification(
    champs: ChampsQualification,
    maintenant: Date = new Date(),
  ): void {
    this.repondreAlEtape(EtapeQuestionnaire.QUALIFICATION, (questionnaire) =>
      questionnaire.repondreALaQualification(champs, maintenant),
    );
  }

  /** Étape 3 — capacité à subir des pertes, d'où sort le montant conseillé. */
  repondreALaCapaciteDePerte(
    champs: ChampsCapaciteDePerte,
    maintenant: Date = new Date(),
  ): void {
    this.repondreAlEtape(
      EtapeQuestionnaire.CAPACITE_DE_PERTE,
      (questionnaire) =>
        questionnaire.repondreALaCapaciteDePerte(champs, maintenant),
    );
  }

  /**
   * L'ossature commune aux trois : ouvrir le questionnaire, vérifier que
   * l'étape est atteignable, appliquer, reprendre le classement.
   *
   * L'ordre compte. Le questionnaire n'est rattaché à la racine **qu'après**
   * que la transition a réussi : une étape refusée — un montant négatif à
   * l'étape 3 — ne doit pas laisser derrière elle un questionnaire vide qui
   * n'existait pas avant l'appel.
   *
   * @throws EtapeQuestionnaireFermeeError si l'étape n'est ni celle attendue ni
   *   une étape déjà répondue.
   */
  private repondreAlEtape(
    etape: EtapeQuestionnaire,
    appliquer: (questionnaire: AdequacyAssessment) => void,
  ): void {
    // Répondre à la première étape fait naître le questionnaire : rien
    // n'oblige le titulaire à l'ouvrir par un geste séparé.
    const questionnaire =
      this._adequacy ?? QuestionnaireAdequationFactory.commencer();

    if (!questionnaire.etapeEstOuverte(etape)) {
      throw new EtapeQuestionnaireFermeeError(
        etape,
        questionnaire.etapeSuivante(),
      );
    }

    appliquer(questionnaire);

    this._adequacy = questionnaire;
    this.reprendreLeClassement();
  }

  /**
   * L'étape que le titulaire doit encore passer — `null` si son questionnaire
   * est clos, `PRE_QUALIFICATION` s'il n'en a pas encore.
   *
   * Un titulaire sans questionnaire n'a pas « aucune étape à faire », il les a
   * toutes : rendre `null` ici aurait laissé croire au front qu'il n'y a rien à
   * demander.
   *
   * Le `if` explicite, et non un `??` sur l'appel optionnel : les deux
   * situations rendent `null` — le questionnaire absent, et le questionnaire
   * **clos** — et un repli les confondrait. Un professionnel, qui n'a plus
   * d'étape à passer, se serait vu redemander la pré-qualification à l'infini.
   */
  etapeSuivanteDuQuestionnaire(): EtapeQuestionnaire | null {
    if (this._adequacy === null) return EtapeQuestionnaire.PRE_QUALIFICATION;
    return this._adequacy.etapeSuivante();
  }

  /** Les étapes franchies, dans l'ordre du parcours ; vide sans questionnaire. */
  etapesReponduesDuQuestionnaire(): EtapeQuestionnaire[] {
    return this._adequacy?.etapesRepondues() ?? [];
  }

  /**
   * Le classement de la racine, repris depuis le questionnaire.
   *
   * Le questionnaire le recalcule lui-même à chaque réponse ; ce que fait cette
   * méthode, c'est le **reporter sur la racine**, dans le même geste que la
   * réponse. C'était auparavant un report fait après coup par le use case, vers
   * une autre table, avec le décalage que cela suppose : un questionnaire
   * enregistré sans que le classement suive laissait le plafond de la veille
   * opposable à la souscription du jour.
   */
  private reprendreLeClassement(): void {
    if (this._adequacy === null) return;

    // La catégorie choisit la classe : un professionnel n'emporte ni patrimoine
    // ni montant conseillé, quoi que le questionnaire en dise.
    this._classement = ClassementPsfp.etabli(
      this._adequacy.categoriePsfp,
      this._adequacy.patrimoineNet,
      this._adequacy.montantMaxConseille,
    );
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

  // ── Le parcours KYB de la société ─────────────────────────────────────────
  //
  // Les quatre gestes de l'instruction d'un dossier moral. Ils sont ici, et non
  // sur `DossierDePieces`, parce qu'ils ne portent pas sur les pièces mais sur
  // le **verdict** qu'on en tire : le dossier de justificatifs constate ce qui
  // manque, la racine décide ce que la société a le droit de faire. Les deux
  // sont deux agrégats, donc deux frontières transactionnelles (§17) — c'est
  // pourquoi ces gestes répondent à des événements et n'appellent jamais
  // `DossierDePieces` eux-mêmes.
  //
  // Tous refusent une personne physique. L'invariant paraît évident et n'était
  // pourtant porté nulle part : la racine est bien clé sur le souscripteur,
  // mais rien n'empêchait d'écrire un état de société sur la ligne d'un
  // titulaire, ni de valider par ce chemin un compte dont l'identité n'a jamais
  // été vérifiée.

  /**
   * Le dossier de la société réunit toutes ses pièces : il part en instruction.
   *
   * Sans effet si le dossier est déjà instruit ou tranché — voir
   * {@link DecisionKyb.soumise} : ce geste répond à un événement, et un
   * événement se redélivre.
   *
   * @throws KybNeConcernePasUnePersonnePhysiqueError
   */
  soumettreLeKybALinstruction(le: Date = new Date()): void {
    this.exigerUneSociete();
    this._kyb = this._kyb.soumise(le);
  }

  /**
   * L'équipe conformité valide le dossier KYB.
   *
   * @param valideJusquAu échéance de la validité, ou `null` pour une validité
   *   sans terme. Elle est **fournie** et non calculée : la cadence de
   *   re-vérification d'une personne morale n'est pas arrêtée (cf.
   *   `DecisionKyb.validee`).
   * @param par le compte de l'agent conformité qui tranche.
   * @throws KybNeConcernePasUnePersonnePhysiqueError
   * @throws KybPasEnInstructionError si le dossier n'est pas en instruction.
   */
  validerLeKyb(
    valideJusquAu: string | null,
    par: number,
    le: Date = new Date(),
  ): void {
    this.exigerUneSociete();
    this._kyb = this._kyb.validee(valideJusquAu, par, le);
  }

  /**
   * L'équipe conformité rejette le dossier KYB, motif à l'appui.
   *
   * @throws KybNeConcernePasUnePersonnePhysiqueError
   * @throws KybPasEnInstructionError si le dossier n'est pas en instruction.
   */
  refuserLeKyb(motif: string, par: number, le: Date = new Date()): void {
    this.exigerUneSociete();
    this._kyb = this._kyb.refusee(motif, par, le);
  }

  /**
   * Le dossier retombe en constitution : une pièce a été refusée, remplacée, ou
   * s'est périmée.
   *
   * **C'est le seul chemin par lequel un KYB validé se révoque** avant son
   * échéance, et il est légal depuis n'importe quel état : une pièce peut être
   * refusée longtemps après la validation.
   *
   * @throws KybNeConcernePasUnePersonnePhysiqueError
   */
  rouvrirLeKyb(motif: string): void {
    this.exigerUneSociete();
    this._kyb = this._kyb.rouverte(motif);
  }

  /** @throws KybNeConcernePasUnePersonnePhysiqueError */
  private exigerUneSociete(): void {
    if (!this._souscripteur.estSociete()) {
      throw new KybNeConcernePasUnePersonnePhysiqueError();
    }
  }

  /** Le dossier KYB attend-il une décision de l'équipe conformité ? */
  kybEstEnInstruction(): boolean {
    return this._souscripteur.estSociete() && this._kyb.estEnInstruction();
  }

  /**
   * Statut du dossier KYB — `null` pour une personne physique, qui n'en a pas.
   *
   * `null` plutôt que `EN_CONSTITUTION` : un titulaire n'a pas un KYB « à
   * commencer », il n'en a pas du tout, et les confondre ferait afficher au
   * représentant légal un dossier de société qui n'existe pas.
   */
  get statutKyb(): StatutKyb | null {
    return this._souscripteur.estSociete() ? this._kyb.statut : null;
  }

  /** Ce qui explique un refus ou une remise en constitution, `null` sinon. */
  get motifRefusKyb(): string | null {
    return this._souscripteur.estSociete() ? this._kyb.motifRefus : null;
  }

  /** Jusqu'à quand le KYB vaut ; `null` sans échéance ou sans société. */
  get kybValideJusquAu(): string | null {
    return this._souscripteur.estSociete() ? this._kyb.valideJusquAu : null;
  }

  // ── Ce que le classement impose ───────────────────────────────────────────

  /**
   * Le classement opposable — jamais `null`.
   *
   * Un titulaire qui n'a pas répondu **est** non averti : le classement se
   * gagne, il ne se présume pas, et rendre `null` obligerait chaque appelant à
   * retrouver ce repli, en l'oubliant parfois. C'est aussi ce qui protège les
   * lignes anciennes relues sans `resultCategorie`.
   *
   * Il est lu ici et non recalculé depuis le questionnaire : la racine le
   * **possède**, et le pose elle-même en répondant. Le questionnaire garde le
   * sien de son côté, comme pièce justificative du passage — c'est ce que la
   * conservation de dix ans (RG-Q-07) exige de conserver, et ce n'est pas le
   * même objet que l'état opposable d'aujourd'hui.
   *
   * Rendu sans copie, à la différence de l'enregistrement plat qu'il remplace :
   * `ClassementPsfp` est immuable, il n'y a rien à protéger d'un appelant.
   */
  get classement(): ClassementPsfp {
    return this._classement;
  }

  /** Niveau de suivi appelé par les réponses ; `null` sans questionnaire. */
  niveauSuivi(): NiveauRisque | null {
    return this._adequacy?.niveauRisque() ?? null;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  /** Identité propre du dossier, attribuée par la persistance. */
  get id(): string {
    return this._id;
  }

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
    /** Déjà à plat : le repository n'a que trois colonnes à remplir. */
    classement: ClassementPsfpSnapshot;
    suivi: SuiviInvestisseurSnapshot;
    /**
     * À plat également, et rendu pour **toutes** les natures de souscripteur —
     * à la différence des getters `statutKyb` et consorts, qui rendent `null`
     * sur un titulaire. Le repository écrit une ligne de table, pas une vue :
     * lui rendre `null` ici l'obligerait à retrouver seul le repli
     * `EN_CONSTITUTION`, et la colonne d'un titulaire s'écrirait à `NULL` là où
     * `restore` attend un statut.
     */
    kyb: DecisionKybSnapshot;
  } {
    return {
      kycCase: this._kycCase,
      adequacy: this._adequacy,
      classement: this._classement.toSnapshot(),
      suivi: this._suivi.toSnapshot(),
      kyb: this._kyb.toSnapshot(),
    };
  }
}
