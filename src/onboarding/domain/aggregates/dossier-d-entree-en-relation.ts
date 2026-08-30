import {
  KycCase,
  KycCaseSnapshot,
  KycIdentiteExtrait,
  MOTIF_REVUE_MANUELLE,
} from 'src/onboarding/domain/entities/kyc-case';
import { KycFactory } from 'src/onboarding/domain/factories/kyc.factory';
import {
  PieceIdentiteDeposee,
  PieceIdentiteDeposeeSnapshot,
} from 'src/onboarding/domain/value-objects/piece-identite-deposee.vo';
import { ProfilInvestisseur } from 'src/onboarding/domain/value-objects/profil-investisseur.vo';
import {
  IdentiteDejaVerifieeError,
  KybNeConcernePasUnePersonnePhysiqueError,
  PieceIdentiteNeConcernePasUneSocieteError,
} from 'src/onboarding/domain/errors';
import {
  DecisionKyb,
  DecisionKybSnapshot,
} from 'src/onboarding/domain/value-objects/decision-kyb.vo';
import { StatutKyb } from 'src/onboarding/domain/enums/statut-kyb.enum';
import { KycStatus } from 'src/onboarding/domain/enums/kyc-status.enum';
import {
  SuiteDuVerdict,
  VerdictIdentite,
} from 'src/onboarding/domain/value-objects/verdict-identite';

/**
 * **Le dossier d'entrée en relation** — un souscripteur a-t-il le droit
 * d'opérer ?
 *
 * Racine d'agrégat du contexte *Onboarding & KYC*. Elle réunit les deux
 * signaux qui répondent à cette question, et à elle seule :
 *
 * | Pièce                   | Ce qu'elle établit                                  |
 * | ----------------------- | --------------------------------------------------- |
 * | {@link KycCase}         | l'identité du titulaire est vérifiée                 |
 * | {@link DecisionKyb}     | le dossier de justificatifs de la société est validé |
 *
 * **Ce qu'elle ne porte plus.** Elle est née de la scission de
 * `InvestorComplianceProfile`, qui tenait en outre le questionnaire
 * d'adéquation, le classement PSFP et la surveillance périodique. Ces trois-là
 * répondent à une **autre** question — non pas « peut-il opérer » mais
 * « jusqu'où » — et sont passés à {@link EvaluationDAdequation}.
 *
 * La scission n'a rien coupé de vivant : les deux moitiés ne se lisaient déjà
 * pas l'une l'autre. `peutOperer()` n'a jamais consulté le classement, et le
 * questionnaire n'a jamais consulté le KYC. Le §3.3 justifiait leur réunion par
 * une dépendance cyclique — RG-KYC-13, « la catégorisation provient du
 * questionnaire » — qui a cessé d'exister le jour où le classement a quitté
 * `ProfilPP` pour la racine : la dérivation est à sens unique, et entièrement
 * du côté de l'adéquation.
 *
 * Ce que la racine ne porte **pas** non plus : les profils personne physique et
 * morale, ni les pièces justificatives. Ils vivent dans le même contexte, ont
 * leur propre cycle de vie — on complète son adresse sans rouvrir son dossier
 * de vérification — et les charger ici ferait un agrégat lourd pour une
 * question qui ne les regarde pas (§6.1). La racine les référence par
 * l'identifiant du titulaire (§6.2).
 */
export class DossierDEntreeEnRelation {
  private readonly _id: string;
  private readonly _investorId: number;
  private readonly _souscripteur: ProfilInvestisseur;
  private _kycCase: KycCase | null;
  private _kyb: DecisionKyb;

  /**
   * @internal Réservé au repository, qui compose la racine depuis ses tables.
   * Il n'éprouve rien : les invariants de chaque pièce sont posés par sa
   * propre fabrique.
   */
  constructor(etat: {
    /** Attribuée par la persistance : absente d'un dossier jamais écrit. */
    id?: string;
    investorId: number;
    /**
     * Au nom de qui ce dossier vaut. Par défaut le titulaire lui-même, ce qui
     * est le cas de toutes les lignes écrites avant que les sociétés aient leur
     * propre dossier.
     */
    souscripteur?: ProfilInvestisseur;
    kycCase: KycCase | null;
    /**
     * Le dossier KYB de la société. Absent du dossier d'un titulaire : le repli
     * est `EN_CONSTITUTION`, jamais une validité présumée.
     */
    kyb?: DecisionKyb;
  }) {
    this._id = etat.id as string;
    this._investorId = etat.investorId;
    this._souscripteur =
      etat.souscripteur ?? ProfilInvestisseur.personnePhysique();
    this._kycCase = etat.kycCase;
    this._kyb = etat.kyb ?? DecisionKyb.initiale();
  }

  /**
   * Souscripteur qui n'a encore rien déposé.
   *
   * `id` reste vide : il est attribué par la persistance. Un dossier qui n'a
   * jamais été écrit n'a pas encore d'identité.
   */
  static vierge(
    investorId: number,
    souscripteur: ProfilInvestisseur = ProfilInvestisseur.personnePhysique(),
  ): DossierDEntreeEnRelation {
    return new DossierDEntreeEnRelation({
      investorId,
      souscripteur,
      kycCase: null,
    });
  }

  /**
   * Au nom de qui ce dossier vaut : le titulaire, ou l'une de ses sociétés.
   *
   * Le **KYC** ne vit que sur le dossier du titulaire : une société n'a pas
   * d'identité à vérifier, elle a un KYB et un représentant dont l'identité
   * vaut pour toutes ses sociétés.
   */
  get souscripteur(): ProfilInvestisseur {
    return this._souscripteur;
  }

  // ── Le verdict ────────────────────────────────────────────────────────────

  /**
   * Ce souscripteur peut-il réaliser des opérations financières — dépôt,
   * souscription, marché secondaire, retrait ?
   *
   * **La réponse dépend de sa nature, parce que les deux ne prouvent pas la
   * même chose.** Un titulaire prouve son identité ; une société n'en a pas à
   * prouver — elle prouve son existence légale et qui la contrôle :
   *
   * | Souscripteur      | Signal faisant foi                       |
   * | ----------------- | ---------------------------------------- |
   * | personne physique | {@link KycCase} — vérification d'identité |
   * | société           | {@link DecisionKyb} — dossier KYB         |
   *
   * Ce que cette méthode **ne dit pas**, et ne peut pas dire : qu'une société
   * ne signe pas elle-même. Le KYC de son représentant légal est une condition
   * supplémentaire, portée par un *autre* dossier — celui du titulaire — donc
   * hors de cette frontière transactionnelle (§17). C'est
   * `aptitudeDeLaSociete` qui compose les deux verdicts.
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

  // ── Le parcours de vérification d'identité ────────────────────────────────

  /** Ouvre ou remplace le dossier de vérification d'identité. */
  deposerDossierKyc(kycCase: KycCase): void {
    this._kycCase = kycCase;
  }

  /**
   * Les trois gestes du parcours, relayés à la pièce qui les porte.
   *
   * Ce relais est la raison d'être d'une racine (§6) : `KycCase` est une
   * **entité interne**, elle n'a ni port ni existence hors de ce dossier.
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
   * Le titulaire dépose son document d'identité et demande, par ce geste même,
   * l'examen humain de son dossier.
   *
   * **Le dépôt *est* la demande.** Les deux ne se séparent pas : un document
   * déposé sans passage en revue attendrait un examen que personne n'a
   * réclamé, et une revue demandée sans document laisserait l'équipe conformité
   * devant un dossier vide.
   *
   * **Le dossier naît s'il n'existe pas.** Un titulaire peut n'avoir jamais
   * ouvert de session chez le fournisseur — parcours abandonné, ou refus d'y
   * passer — et lui refuser le recours manuel le laisserait sans aucun chemin
   * vers la vérification.
   *
   * @throws PieceIdentiteNeConcernePasUneSocieteError sur un dossier de société.
   * @throws IdentiteDejaVerifieeError si la vérification est déjà acquise et
   *   non périmée : le dépôt manuel est un recours, pas un second chemin.
   */
  deposerLaPieceIdentitePourRevue(
    piece: PieceIdentiteDeposee,
    maintenant: Date = new Date(),
  ): void {
    if (this._souscripteur.estSociete()) {
      throw new PieceIdentiteNeConcernePasUneSocieteError();
    }

    // `peutOperer` et non le seul statut : un dossier validé mais **périmé** ne
    // prouve plus rien, et son titulaire doit pouvoir le refaire établir.
    if (this.peutOperer(maintenant)) {
      throw new IdentiteDejaVerifieeError();
    }

    this._kycCase ??= KycFactory.creer();

    this._kycCase.deposerLaPieceIdentite(piece);
    this._kycCase.changerStatut(KycStatus.EN_REVUE, MOTIF_REVUE_MANUELLE);
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
  // Tous refusent une personne physique : rien n'empêcherait sinon d'écrire un
  // état de société sur la ligne d'un titulaire, ni de valider par ce chemin un
  // compte dont l'identité n'a jamais été vérifiée.

  /**
   * Le dossier de la société réunit toutes ses pièces : il part en instruction.
   *
   * Sans effet s'il est déjà instruit ou tranché — ce geste répond à un
   * événement, et un événement se redélivre.
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
   *   re-vérification d'une personne morale n'est pas arrêtée.
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

  // ── Lectures ──────────────────────────────────────────────────────────────

  /** Identité propre du dossier, attribuée par la persistance. */
  get id(): string {
    return this._id;
  }

  get investorId(): number {
    return this._investorId;
  }

  // Ce que la racine publie de sa pièce, ce sont des **valeurs**. Elle rendait
  // `KycCase` par un getter, si bien que l'application, la présentation et
  // jusqu'au contexte `iam` tenaient une entité interne et pouvaient en appeler
  // les transitions. Une racine qui tend ses pièces ne protège plus rien (§6).

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

  /** Le document déposé pour la revue manuelle, tel qu'il se publie. */
  get pieceIdentitePubliee(): PieceIdentiteDeposeeSnapshot | null {
    return this._kycCase?.pieceIdentiteDeposee?.toSnapshot() ?? null;
  }

  /**
   * Le dossier de vérification tel qu'il se publie — des primitives, pas
   * l'entité.
   */
  get dossierKycPublie(): KycCaseSnapshot | null {
    return this._kycCase?.toJSON() ?? null;
  }

  /**
   * @internal Réservé au repository, qui répartit la pièce et le verdict entre
   * leurs deux tables.
   *
   * Public faute de mieux — TypeScript n'a pas de classe amie. C'est **une**
   * porte, nommée et documentée, là où un getter ordinaire se lirait comme une
   * API. Y passer, c'est se déclarer repository.
   */
  get pieces(): {
    kycCase: KycCase | null;
    /**
     * À plat, et rendu pour **toutes** les natures de souscripteur — à la
     * différence des getters `statutKyb` et consorts, qui rendent `null` sur un
     * titulaire. Le repository écrit une ligne de table, pas une vue : lui
     * rendre `null` ici l'obligerait à retrouver seul le repli
     * `EN_CONSTITUTION`.
     */
    kyb: DecisionKybSnapshot;
  } {
    return { kycCase: this._kycCase, kyb: this._kyb.toSnapshot() };
  }
}
