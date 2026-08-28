import { CategoriePsfp } from '../enums/categorie-psfp.enum';
import { EtapeQuestionnaire } from '../enums/etape-questionnaire.enum';
import { NiveauRisque } from '../enums/niveau-risque.enum';
import { QuestionnaireAdequationMapper } from '../mappers/questionnaire-adequation.mapper';
import {
  AvancementQuestionnaire,
  AvancementSnapshot,
} from '../value-objects/avancement-questionnaire.vo';
import {
  CapaciteDePerte,
  CapaciteDePerteSnapshot,
  CapaciteDePerteSnapshotBrut,
  ChampsCapaciteDePerte,
} from '../value-objects/capacite-de-perte.vo';
import {
  ChampsPreQualification,
  PreQualificationPsfp,
  PreQualificationSnapshot,
} from '../value-objects/pre-qualification-psfp.vo';
import {
  ChampsQualification,
  QualificationPsfp,
  QualificationSnapshot,
} from '../value-objects/qualification-psfp.vo';
import {
  ResultatAdequation,
  ResultatAdequationSnapshot,
  ResultatAdequationSnapshotBrut,
} from '../value-objects/resultat-adequation.vo';

/**
 * Patrimoine à partir duquel un non-averti est suivi comme « modéré » plutôt
 * que « vulnérable ». Seuil de suivi interne, pas de règle PSFP.
 */
const PATRIMOINE_SUIVI_MODERE = 100_000;

/**
 * Tout ce que le titulaire répond, vu comme un seul formulaire.
 *
 * Le type est **composé** de celui de chaque étape plutôt qu'écrit à plat :
 * ajouter une question à l'étape 2 l'ajoute ici sans qu'on y pense, et il
 * devient impossible qu'une question existe dans le formulaire sans appartenir
 * à une étape.
 */
export type ReponsesQuestionnaire = ChampsPreQualification &
  ChampsQualification &
  ChampsCapaciteDePerte;

/**
 * Ce que le questionnaire ajoute à ses étapes : sa clé et ses dates.
 *
 * Il portait aussi `utilisateurId` — voir `EnteteKycCase` : une pièce interne
 * n'a pas à connaître le titulaire, c'est sa racine qui le connaît (§6).
 */
export interface EnteteQuestionnaire {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * État complet du questionnaire, tel qu'il transite depuis/vers la persistance.
 *
 * Des primitives uniquement, à plat : les Value Objects ne franchissent pas la
 * frontière du domaine (§12.7), et la forme plate est celle de la table. Les
 * clés sont celles publiées avant le découpage — `GET /profiles/questionnaire/me`
 * renvoie le même JSON, aux décimaux près (voir {@link toJSON}).
 */
export interface AdequacyAssessmentSnapshot
  extends
    EnteteQuestionnaire,
    PreQualificationSnapshot,
    QualificationSnapshot,
    CapaciteDePerteSnapshot,
    AvancementSnapshot,
    ResultatAdequationSnapshot {}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les formes que rend
 * réellement le driver Postgres — chaîne pour une colonne `decimal`.
 */
export interface AdequacyAssessmentSnapshotBrut
  extends
    EnteteQuestionnaire,
    PreQualificationSnapshot,
    QualificationSnapshot,
    CapaciteDePerteSnapshotBrut,
    AvancementSnapshot,
    ResultatAdequationSnapshotBrut {}

/**
 * Questionnaire d'adéquation PSFP — un par compte.
 *
 * **Une façade sur cinq blocs** : les trois étapes du formulaire, l'avancement
 * du parcours, et le classement qui en découle.
 *
 * | Bloc                      | Sujet                                            |
 * | ------------------------- | ------------------------------------------------ |
 * | `PreQualificationPsfp`    | étape 1 — professionnel ? (2 critères sur 3)     |
 * | `QualificationPsfp`       | étape 2 — averti ? (4 critères sur 5)            |
 * | `CapaciteDePerte`         | étape 3 — patrimoine, revenus, budget            |
 * | `AvancementQuestionnaire` | quelles étapes ont été répondues, et quand       |
 * | `ResultatAdequation`      | catégorie et plafond, **calculés, jamais déclarés** |
 *
 * Il n'existait aucun modèle de domaine pour ce questionnaire : le classement
 * réglementaire — celui qui décide du délai de rétractation et du plafond
 * d'investissement — vivait dans `SaveQuestionnaireUseCase`, entre un
 * `Object.assign(entity, dto)` et deux appels de repository TypeORM. Les seuils
 * étaient des littéraux au fil du code, la règle intestable sans base de
 * données, et n'importe quelle clé du DTO entrait telle quelle dans la ligne.
 *
 * **Le questionnaire se répond étape par étape**, chacune par sa transition —
 * {@link repondreALaPreQualification}, {@link repondreALaQualification},
 * {@link repondreALaCapaciteDePerte}. C'est le parcours en trois temps que
 * décrit le cahier des charges, et qu'aucune route ne savait exposer tant que
 * le formulaire arrivait entier.
 *
 * Il se répondait auparavant **d'un seul bloc**, et il le peut encore par
 * {@link repondre}, que sert la route historique. Ce n'était pas un choix
 * gratuit : `PreQualificationPsfp.declarer` et ses jumelles reconstruisent leur
 * bloc depuis un objet plat où une clé absente vaut « non », si bien qu'envoyer
 * l'étape 1 seule à `repondre` **effacerait** les étapes 2 et 3. Les trois
 * transitions ci-dessous n'ont pas ce défaut : chacune ne reconstruit que son
 * propre bloc et laisse les autres en place.
 *
 * Ce que le découpage ne relâche pas, c'est l'accord entre les réponses et le
 * classement : chaque transition **reclasse** (voir {@link reclasser}), de sorte
 * que le classement corresponde toujours aux trois blocs tels qu'ils sont
 * stockés — jamais à un mélange de deux passages.
 */
export class AdequacyAssessment {
  private readonly _id: string;
  private _preQualification: PreQualificationPsfp;
  private _qualification: QualificationPsfp;
  private _capacite: CapaciteDePerte;
  private _avancement: AvancementQuestionnaire;
  private _resultat: ResultatAdequation;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * @internal Réservé à `QuestionnaireAdequationFactory` et à son mapper.
   *
   * Public faute de mieux : TypeScript n'a pas de classe amie. Il n'éprouve
   * rien — passer par ici, c'est se déclarer fabrique ou mapper, et prendre à
   * sa charge les invariants que l'une pose et que l'autre assume de ne pas
   * rejouer.
   */
  constructor(etat: {
    entete: EnteteQuestionnaire;
    preQualification: PreQualificationPsfp;
    qualification: QualificationPsfp;
    capacite: CapaciteDePerte;
    avancement: AvancementQuestionnaire;
    resultat: ResultatAdequation;
  }) {
    this._id = etat.entete.id;
    this._createdAt = etat.entete.createdAt;
    this._updatedAt = etat.entete.updatedAt;
    this._preQualification = etat.preQualification;
    this._qualification = etat.qualification;
    this._capacite = etat.capacite;
    this._avancement = etat.avancement;
    this._resultat = etat.resultat;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Nouvelles réponses, et nouveau classement.
   *
   * Les quatre blocs sont construits **avant** la moindre affectation : un
   * montant refusé par l'étape 3 laisse donc le questionnaire exactement dans
   * l'état où il était, plutôt qu'à moitié réécrit avec un classement calculé
   * sur des réponses mélangées.
   *
   * Le classement est recalculé à chaque passage — c'est le seul moment où il
   * peut l'être, et cela garantit qu'il correspond toujours aux réponses
   * enregistrées avec lui.
   */
  repondre(
    reponses: ReponsesQuestionnaire,
    maintenant: Date = new Date(),
  ): void {
    const preQualification = PreQualificationPsfp.declarer(reponses);
    const qualification = QualificationPsfp.declarer(reponses);
    const capacite = CapaciteDePerte.declarer(reponses);
    const resultat = ResultatAdequation.calculer(
      preQualification,
      qualification,
      capacite,
    );

    this._preQualification = preQualification;
    this._qualification = qualification;
    this._capacite = capacite;
    // Les trois étapes sont soumises ensemble, donc datées ensemble.
    this._avancement = AvancementQuestionnaire.toutRepondu(maintenant);
    this._resultat = resultat;
  }

  // ── Les trois étapes, une par une ─────────────────────────────────────────
  //
  // Chacune ne reconstruit que **son** bloc, date sa réponse, et reclasse. Le
  // découpage ne change aucune règle : ce sont les mêmes `declarer` et le même
  // `ResultatAdequation.calculer` que le passage d'un bloc.
  //
  // Aucune ne vérifie qu'elle est ouverte — savoir si l'étape est atteignable
  // demande de connaître le questionnaire *et* son absence éventuelle, ce dont
  // seule la racine dispose. Voir `InvestorComplianceProfile.repondreAlEtape`.

  /** Étape 1 — les trois critères qui font, ou non, un professionnel. */
  repondreALaPreQualification(
    champs: ChampsPreQualification,
    maintenant: Date = new Date(),
  ): void {
    const preQualification = PreQualificationPsfp.declarer(champs);

    this._preQualification = preQualification;
    this._avancement = this._avancement.repondue(
      EtapeQuestionnaire.PRE_QUALIFICATION,
      maintenant,
    );
    this.reclasser();
  }

  /** Étape 2 — expérience et compréhension du risque : averti ou non. */
  repondreALaQualification(
    champs: ChampsQualification,
    maintenant: Date = new Date(),
  ): void {
    const qualification = QualificationPsfp.declarer(champs);

    this._qualification = qualification;
    this._avancement = this._avancement.repondue(
      EtapeQuestionnaire.QUALIFICATION,
      maintenant,
    );
    this.reclasser();
  }

  /**
   * Étape 3 — patrimoine, revenus, budget, et la perte simulée acceptée.
   *
   * La seule des trois dont les réponses peuvent être **refusées** : un montant
   * négatif ou illisible lève depuis `CapaciteDePerte.declarer`. Le bloc est
   * donc construit avant la moindre affectation — un montant refusé laisse le
   * questionnaire exactement dans l'état où il était, avancement compris.
   */
  repondreALaCapaciteDePerte(
    champs: ChampsCapaciteDePerte,
    maintenant: Date = new Date(),
  ): void {
    const capacite = CapaciteDePerte.declarer(champs);

    this._capacite = capacite;
    this._avancement = this._avancement.repondue(
      EtapeQuestionnaire.CAPACITE_DE_PERTE,
      maintenant,
    );
    this.reclasser();
  }

  /**
   * Le classement, refait depuis les trois blocs tels qu'ils sont maintenant.
   *
   * Appelé par chaque transition, et par elles seules : c'est ce qui garantit
   * qu'aucune réponse enregistrée ne coexiste avec un classement qui l'ignore.
   * Il n'est **jamais** recalculé à la lecture — voir
   * `ResultatAdequation.restore`.
   */
  private reclasser(): void {
    this._resultat = ResultatAdequation.calculer(
      this._preQualification,
      this._qualification,
      this._capacite,
    );
  }

  // ── L'enchaînement des étapes ─────────────────────────────────────────────

  /**
   * Quelle étape reste à poser au titulaire — `null` si le questionnaire est
   * clos.
   *
   * La règle traverse l'avancement **et** deux blocs de réponses : c'est ce qui
   * la fait vivre ici plutôt que dans l'un d'eux. Elle se lit dans l'ordre du
   * parcours, chaque étape pouvant clore la suite selon son propre résultat —
   * un professionnel n'a pas de qualification à passer, un averti pas de
   * capacité de perte à simuler.
   *
   * Elle n'existait nulle part : le front recevait un formulaire entier et
   * devait deviner seul lequel de ses trois volets afficher, en réappliquant
   * des seuils réglementaires que seul le domaine connaît.
   */
  etapeSuivante(): EtapeQuestionnaire | null {
    if (!this._avancement.aRepondu(EtapeQuestionnaire.PRE_QUALIFICATION)) {
      return EtapeQuestionnaire.PRE_QUALIFICATION;
    }
    if (this._preQualification.estProfessionnel()) return null;

    if (!this._avancement.aRepondu(EtapeQuestionnaire.QUALIFICATION)) {
      return EtapeQuestionnaire.QUALIFICATION;
    }
    if (this._qualification.estAverti()) return null;

    if (!this._avancement.aRepondu(EtapeQuestionnaire.CAPACITE_DE_PERTE)) {
      return EtapeQuestionnaire.CAPACITE_DE_PERTE;
    }
    return null;
  }

  /**
   * Le titulaire a-t-il le droit de répondre à cette étape ?
   *
   * Deux cas, et deux seulement : c'est l'étape attendue, ou c'en est une qu'il
   * a déjà répondue. Le second couvre la reprise, que le cahier des charges
   * autorise explicitement — « re-compléter cette étape ainsi que toutes les
   * autres à n'importe quel moment ».
   */
  etapeEstOuverte(etape: EtapeQuestionnaire): boolean {
    return etape === this.etapeSuivante() || this._avancement.aRepondu(etape);
  }

  /** Les étapes franchies, dans l'ordre — de quoi afficher un fil d'Ariane. */
  etapesRepondues(): EtapeQuestionnaire[] {
    return this._avancement.etapesRepondues();
  }

  // ── Règles propres au questionnaire ───────────────────────────────────────

  /**
   * Niveau de suivi que ces réponses appellent.
   *
   * La règle traverse deux blocs — le classement et le patrimoine — c'est ce
   * qui la fait rester ici plutôt que dans l'un d'eux. Elle vivait dans
   * `RiskScoringService`, où elle comparait `resultCategorie` à des chaînes
   * nues, à côté d'une écriture en base.
   */
  niveauRisque(): NiveauRisque {
    if (this._resultat.estProfessionnel()) return NiveauRisque.QUALIFIE;
    if (this._resultat.estAverti()) return NiveauRisque.MODERE;

    return (this._capacite.patrimoineNet ?? 0) >= PATRIMOINE_SUIVI_MODERE
      ? NiveauRisque.MODERE
      : NiveauRisque.VULNERABLE;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._id;
  }
  get preQualification(): PreQualificationPsfp {
    return this._preQualification;
  }
  get qualification(): QualificationPsfp {
    return this._qualification;
  }
  get capacite(): CapaciteDePerte {
    return this._capacite;
  }
  get avancement(): AvancementQuestionnaire {
    return this._avancement;
  }
  get resultat(): ResultatAdequation {
    return this._resultat;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Délégations ───────────────────────────────────────────────────────────
  //
  // Ce que le reste du contexte lit réellement sur un questionnaire : le
  // classement qu'il faut reporter sur le profil.

  get categoriePsfp(): CategoriePsfp | null {
    return this._resultat.categorie;
  }
  get montantMaxConseille(): number | null {
    return this._resultat.montantMaxConseille;
  }
  get patrimoineNet(): number | null {
    return this._capacite.patrimoineNet;
  }

  // ── Sérialisation ─────────────────────────────────────────────────────────

  /**
   * Représentation exposable du questionnaire.
   *
   * La mise en forme appartient à {@link QuestionnaireAdequationMapper} ; seul
   * le point d'accroche reste ici, pour que `res.json()` protège aussi les
   * chemins de sérialisation indirects. Les clés sont celles d'avant ; seule
   * différence, les montants sortent en nombres là où le driver Postgres
   * rendait les `decimal` en chaînes — c'est déjà la forme que `GET
   * /profiles/pp/me` publie pour le patrimoine déclaré.
   */
  toJSON(): AdequacyAssessmentSnapshot {
    return QuestionnaireAdequationMapper.toSnapshot(this);
  }
}
