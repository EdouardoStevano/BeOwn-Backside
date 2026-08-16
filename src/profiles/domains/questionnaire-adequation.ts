import { CategoriePsfp } from './enums/kyc-status.enum';
import { NiveauRisque } from './enums/niveau-risque.enum';
import { QuestionnaireAdequationMapper } from './mappers/questionnaire-adequation.mapper';
import {
  CapaciteDePerte,
  CapaciteDePerteSnapshot,
  CapaciteDePerteSnapshotBrut,
  ChampsCapaciteDePerte,
} from './value-objects/capacite-de-perte.vo';
import {
  ChampsPreQualification,
  PreQualificationPsfp,
  PreQualificationSnapshot,
} from './value-objects/pre-qualification-psfp.vo';
import {
  ChampsQualification,
  QualificationPsfp,
  QualificationSnapshot,
} from './value-objects/qualification-psfp.vo';
import {
  ResultatAdequation,
  ResultatAdequationSnapshot,
  ResultatAdequationSnapshotBrut,
} from './value-objects/resultat-adequation.vo';

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

/** Ce que le questionnaire ajoute à ses étapes : sa clé, le compte, ses dates. */
export interface EnteteQuestionnaire {
  id: string;
  utilisateurId: number;
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
export interface QuestionnaireAdequationSnapshot
  extends
    EnteteQuestionnaire,
    PreQualificationSnapshot,
    QualificationSnapshot,
    CapaciteDePerteSnapshot,
    ResultatAdequationSnapshot {}

/**
 * Ce que `restore` accepte : le snapshot, mais tolérant sur les formes que rend
 * réellement le driver Postgres — chaîne pour une colonne `decimal`.
 */
export interface QuestionnaireAdequationSnapshotBrut
  extends
    EnteteQuestionnaire,
    PreQualificationSnapshot,
    QualificationSnapshot,
    CapaciteDePerteSnapshotBrut,
    ResultatAdequationSnapshotBrut {}

/**
 * Questionnaire d'adéquation PSFP — un par compte.
 *
 * **Une façade sur quatre blocs** : les trois étapes du formulaire, et le
 * classement qui en découle.
 *
 * | Bloc                   | Sujet                                            |
 * | ---------------------- | ------------------------------------------------ |
 * | `PreQualificationPsfp` | étape 1 — professionnel ? (2 critères sur 3)     |
 * | `QualificationPsfp`    | étape 2 — averti ? (4 critères sur 5)            |
 * | `CapaciteDePerte`      | étape 3 — patrimoine, revenus, budget            |
 * | `ResultatAdequation`   | catégorie et plafond, **calculés, jamais déclarés** |
 *
 * Il n'existait aucun modèle de domaine pour ce questionnaire : le classement
 * réglementaire — celui qui décide du délai de rétractation et du plafond
 * d'investissement — vivait dans `SaveQuestionnaireUseCase`, entre un
 * `Object.assign(entity, dto)` et deux appels de repository TypeORM. Les seuils
 * étaient des littéraux au fil du code, la règle intestable sans base de
 * données, et n'importe quelle clé du DTO entrait telle quelle dans la ligne.
 *
 * Le questionnaire se répond **d'un bloc** : {@link repondre} remplace les
 * trois étapes et recalcule le classement. C'est le contraire de
 * `ProfilPP.mettreAJour`, qui distingue « ne pas toucher » de « effacer », et
 * c'est voulu — un formulaire d'adéquation partiellement resoumis donnerait un
 * classement issu d'un mélange de deux passages.
 */
export class QuestionnaireAdequation {
  private readonly _id: string;
  private readonly _utilisateurId: number;
  private _preQualification: PreQualificationPsfp;
  private _qualification: QualificationPsfp;
  private _capacite: CapaciteDePerte;
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
    resultat: ResultatAdequation;
  }) {
    this._id = etat.entete.id;
    this._utilisateurId = etat.entete.utilisateurId;
    this._createdAt = etat.entete.createdAt;
    this._updatedAt = etat.entete.updatedAt;
    this._preQualification = etat.preQualification;
    this._qualification = etat.qualification;
    this._capacite = etat.capacite;
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
  repondre(reponses: ReponsesQuestionnaire): void {
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
    this._resultat = resultat;
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
  get utilisateurId(): number {
    return this._utilisateurId;
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
  toJSON(): QuestionnaireAdequationSnapshot {
    return QuestionnaireAdequationMapper.toSnapshot(this);
  }
}
