import {
  AdequacyAssessment,
  AdequacyAssessmentSnapshot,
  ReponsesQuestionnaire,
} from 'src/adequacy/domain/entities/adequacy-assessment';
import { QuestionnaireAdequationFactory } from 'src/adequacy/domain/factories/questionnaire-adequation.factory';
import {
  ClassementPsfp,
  ClassementPsfpSnapshot,
} from 'src/adequacy/domain/value-objects/classement-psfp.vo';
import { EtapeQuestionnaire } from 'src/adequacy/domain/enums/etape-questionnaire.enum';
import { ProfilInvestisseur } from 'src/adequacy/domain/value-objects/profil-investisseur.vo';
import { EtapeQuestionnaireFermeeError } from 'src/adequacy/domain/errors';
import { ChampsPreQualification } from 'src/adequacy/domain/value-objects/pre-qualification-psfp.vo';
import { ChampsQualification } from 'src/adequacy/domain/value-objects/qualification-psfp.vo';
import { ChampsCapaciteDePerte } from 'src/adequacy/domain/value-objects/capacite-de-perte.vo';
import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';
import {
  SuiviInvestisseur,
  SuiviInvestisseurSnapshot,
} from 'src/adequacy/domain/value-objects/suivi-investisseur.vo';

/**
 * **L'évaluation d'adéquation** — jusqu'où un investisseur peut aller.
 *
 * Racine d'agrégat du contexte *Adéquation & profil de risque*. Elle réunit
 * trois choses qu'une seule question relie :
 *
 * | Pièce                       | Ce qu'elle établit                        |
 * | --------------------------- | ----------------------------------------- |
 * | {@link AdequacyAssessment}  | ce que le titulaire a répondu             |
 * | {@link ClassementPsfp}      | la catégorie qui en découle, et son plafond |
 * | {@link SuiviInvestisseur}   | la cadence de surveillance qu'elle appelle |
 *
 * **Les trois ne se séparent pas**, et c'est ce qui en fait un agrégat plutôt
 * que trois : un questionnaire enregistré sans que le classement suive
 * laisserait le plafond de la veille opposable à la souscription du jour, et le
 * niveau de risque se déduit des mêmes réponses. C'était déjà l'invariant que
 * `InvestorComplianceProfile` protégeait ; il est ici sans rien perdre.
 *
 * **Ce qu'elle ne porte plus.** Elle est née de la scission de
 * `InvestorComplianceProfile`, qui tenait en outre le dossier de vérification
 * d'identité et le verdict KYB. Ceux-là répondent à une **autre** question —
 * non pas « jusqu'où » mais « peut-il opérer » — et sont passés à
 * {@link DossierDEntreeEnRelation}.
 *
 * La scission n'a rien coupé de vivant : ni `repondreAuQuestionnaire`, ni le
 * classement, ni le suivi n'ont jamais consulté le KYC. La dérivation que
 * RG-KYC-13 décrit — « la catégorisation provient du questionnaire » — est à
 * sens unique et entièrement contenue ici.
 *
 * **Clé sur le profil investisseur, pas sur le compte.** Le classement
 * s'apprécie sur l'investisseur : une SAS peut être professionnelle quand son
 * dirigeant est non-averti, et lui opposer le plafond de son représentant lui
 * imposerait un délai de rétractation qui ne la concerne pas.
 */
export class EvaluationDAdequation {
  private readonly _id: string;
  private readonly _investorId: number;
  private readonly _souscripteur: ProfilInvestisseur;
  private _adequacy: AdequacyAssessment | null;
  private _classement: ClassementPsfp;
  private _suivi: SuiviInvestisseur;

  /**
   * @internal Réservé au repository. Il n'éprouve rien : les invariants de
   * chaque pièce sont posés par sa propre fabrique.
   */
  constructor(etat: {
    /** Attribuée par la persistance : absente d'une évaluation jamais écrite. */
    id?: string;
    investorId: number;
    souscripteur?: ProfilInvestisseur;
    adequacy: AdequacyAssessment | null;
    classement?: ClassementPsfp;
    suivi?: SuiviInvestisseur;
  }) {
    this._id = etat.id as string;
    this._investorId = etat.investorId;
    this._souscripteur =
      etat.souscripteur ?? ProfilInvestisseur.personnePhysique();
    this._adequacy = etat.adequacy;
    this._classement = etat.classement ?? ClassementPsfp.initial();
    this._suivi = etat.suivi ?? SuiviInvestisseur.jamaisEvalue();
  }

  /**
   * Investisseur qui n'a pas encore répondu.
   *
   * Ce n'est pas une absence d'évaluation : qui n'a pas répondu **est** non
   * averti, et le classement initial le dit. Le classement se gagne, il ne se
   * présume pas.
   */
  static vierge(
    investorId: number,
    souscripteur: ProfilInvestisseur = ProfilInvestisseur.personnePhysique(),
  ): EvaluationDAdequation {
    return new EvaluationDAdequation({
      investorId,
      souscripteur,
      adequacy: null,
    });
  }

  /** Au nom de qui cette évaluation vaut : le titulaire, ou l'une de ses sociétés. */
  get souscripteur(): ProfilInvestisseur {
    return this._souscripteur;
  }

  // ── Le classement réglementaire ───────────────────────────────────────────

  /**
   * Investisseur non averti au sens PSFP : plafond conseillé et délai de
   * rétractation de quatre jours s'appliquent.
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
   */
  plafondConseille(): number | null {
    return this._classement.plafondConseille();
  }

  /**
   * Le classement opposable — jamais `null`.
   *
   * Un titulaire qui n'a pas répondu **est** non averti, et rendre `null`
   * obligerait chaque appelant à retrouver ce repli, en l'oubliant parfois.
   *
   * Il est lu ici et non recalculé depuis le questionnaire : la racine le
   * **possède**, et le pose elle-même en répondant. Le questionnaire garde le
   * sien de son côté, comme pièce justificative du passage — ce que la
   * conservation de dix ans (RG-Q-07) exige de garder, et ce n'est pas le même
   * objet que l'état opposable d'aujourd'hui.
   */
  get classement(): ClassementPsfp {
    return this._classement;
  }

  // ── Le questionnaire ──────────────────────────────────────────────────────

  /**
   * Enregistre le passage du questionnaire d'adéquation, d'un bloc.
   *
   * **Un investisseur n'a qu'un questionnaire** : repasser le formulaire
   * remplace ses réponses et son classement, il n'en crée pas un second.
   *
   * Le classement est recalculé par l'entité à chaque passage, jamais déclaré :
   * c'est ce qui interdit de se prétendre « averti ».
   */
  repondreAuQuestionnaire(reponses: ReponsesQuestionnaire): void {
    if (this._adequacy !== null) {
      this._adequacy.repondre(reponses);
    } else {
      this._adequacy = QuestionnaireAdequationFactory.repondre(reponses);
    }

    // Repris **dans le même geste**. C'était un report fait après coup vers une
    // autre table, avec le décalage que cela suppose : un questionnaire
    // enregistré sans que le classement suive laissait le plafond de la veille
    // opposable à la souscription du jour.
    this.reprendreLeClassement();
  }

  // ── Le questionnaire, étape par étape ─────────────────────────────────────
  //
  // Le formulaire arrivait entier, par une seule route : le front recevait les
  // trois étapes d'un coup et devait deviner seul laquelle poser, en
  // réappliquant des seuils réglementaires que seul le domaine connaît. Ces
  // trois transitions les exposent une par une, et `etapeSuivante` dit laquelle
  // vient.

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

  /** `false` tant que le titulaire n'a pas répondu au questionnaire. */
  aReponduAuQuestionnaire(): boolean {
    return this._adequacy !== null;
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
   * Le classement de la racine, repris depuis le questionnaire.
   *
   * Le questionnaire le recalcule lui-même à chaque réponse ; ce que fait cette
   * méthode, c'est le **reporter sur la racine**, dans le même geste.
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

  // ── La surveillance périodique (PSFP art. 21) ─────────────────────────────

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

  /** Le contact périodique de cet investisseur est-il dû ? */
  contactEstDu(maintenant: Date = new Date()): boolean {
    return this._suivi.contactEstDu(maintenant);
  }

  get suivi(): SuiviInvestisseurSnapshot {
    return this._suivi.toSnapshot();
  }

  /** Niveau de suivi appelé par les réponses ; `null` sans questionnaire. */
  niveauSuivi(): NiveauRisque | null {
    return this._adequacy?.niveauRisque() ?? null;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  /** Identité propre de l'évaluation, attribuée par la persistance. */
  get id(): string {
    return this._id;
  }

  get investorId(): number {
    return this._investorId;
  }

  /**
   * @internal Réservé au repository, qui répartit les pièces entre leurs
   * tables. Y passer, c'est se déclarer repository.
   */
  get pieces(): {
    adequacy: AdequacyAssessment | null;
    /** Déjà à plat : le repository n'a que trois colonnes à remplir. */
    classement: ClassementPsfpSnapshot;
    suivi: SuiviInvestisseurSnapshot;
  } {
    return {
      adequacy: this._adequacy,
      classement: this._classement.toSnapshot(),
      suivi: this._suivi.toSnapshot(),
    };
  }
}
