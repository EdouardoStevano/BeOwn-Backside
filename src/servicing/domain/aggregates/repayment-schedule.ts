import { Echeance, type EcheanceSnapshot } from '../entities/echeance';
import { EcheanceStatus } from '../enums/echeance.enum';
import { EcheanceIntrouvableError } from '../errors';
import type { PrelevementForfaitaire } from '../value-objects/prelevement-forfaitaire.vo';

/**
 * **Échéancier de remboursement** (RG-ECH-01, M8) — la série ordonnée des
 * coupons qu'un investissement versera jusqu'à son terme, et la racine par
 * laquelle on l'interroge et on le règle.
 *
 * C'est l'agrégat racine du contexte (§6). Il existe parce que les questions
 * qu'on pose à un échéancier ne portent jamais sur une échéance isolée :
 * « combien de capital reste-t-il dû », « quelle est la prochaine échéance »,
 * « cet investissement est-il intégralement remboursé » se répondent sur la
 * série entière. Ces trois calculs vivaient dispersés dans les services de
 * KPI et les écrans d'administration, chacun refaisant sa somme sur des lignes
 * ORM.
 *
 * **Un échéancier par investissement.** La frontière transactionnelle est
 * celle-là (§17) : régénérer l'échéancier d'un investissement qui se complète
 * n'a aucun effet sur celui de son voisin, même sur le même projet. L'agrégat
 * reste petit (§6.1, point 5) — une durée de projet, donc quelques dizaines
 * d'échéances au plus.
 *
 * Il ne connaît de l'investissement que son identifiant (§6.2) : ni son
 * montant, ni son statut, ni son titulaire.
 */
export class RepaymentSchedule {
  private constructor(
    private readonly _investissementId: string,
    private readonly _echeances: Echeance[],
  ) {}

  /**
   * Reconstruit l'échéancier depuis la persistance.
   *
   * Il ordonne, mais ne juge pas : un agrégat rechargé n'a pas à refuser des
   * données déjà en base, sous peine de rendre illisible un échéancier
   * historique qu'aucune écriture ne pourrait plus corriger. Les invariants
   * s'imposent aux transitions, pas à la relecture.
   */
  static reconstituer(
    investissementId: string,
    echeances: Echeance[],
  ): RepaymentSchedule {
    return new RepaymentSchedule(
      investissementId,
      [...echeances].sort((a, b) => a.numero - b.numero),
    );
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * Règle l'une des échéances : la décision de payabilité et le calcul du PFU
   * appartiennent à l'échéance, mais l'ordre passe par la racine (§6) — le
   * code externe ne tient jamais une `Echeance` qu'il pourrait faire muter
   * hors de sa série.
   */
  payer(echeanceId: string, maintenant?: Date): PrelevementForfaitaire {
    const echeance = this._echeances.find((e) => e.id === echeanceId);
    if (!echeance) {
      throw new EcheanceIntrouvableError(echeanceId);
    }

    return echeance.payer(maintenant);
  }

  // ── Interrogations ────────────────────────────────────────────────────────

  get investissementId(): string {
    return this._investissementId;
  }

  /** Les échéances par numéro croissant. Lecture seule : voir `payer`. */
  get echeances(): readonly Echeance[] {
    return this._echeances;
  }

  get estVide(): boolean {
    return this._echeances.length === 0;
  }

  /**
   * Le capital que l'émetteur doit encore à l'investisseur : la somme des
   * parts de capital des échéances non réglées. Les intérêts n'en sont pas —
   * ils ne sont pas dus tant que l'échéance n'est pas échue.
   */
  get capitalRestantDu(): number {
    return round2(
      this._echeances
        .filter((e) => e.statut !== EcheanceStatus.PAYE)
        .reduce((somme, e) => somme + e.montantCapital, 0),
    );
  }

  /** Les intérêts **bruts** déjà versés, avant retenue à la source. */
  get interetsPercus(): number {
    return round2(
      this._echeances
        .filter((e) => e.statut === EcheanceStatus.PAYE)
        .reduce((somme, e) => somme + e.montantInterets, 0),
    );
  }

  /** La retenue à la source déjà prélevée sur cet échéancier (IR + CSG). */
  get prelevementsALaSource(): number {
    return round2(
      this._echeances.reduce(
        (somme, e) => somme + e.prelevementIR + e.prelevementCSG,
        0,
      ),
    );
  }

  /** La première échéance encore due, ou `null` si tout est réglé. */
  get prochaineEcheance(): Echeance | null {
    return this._echeances.find((e) => e.estPayable) ?? null;
  }

  /**
   * L'obligation est arrivée à son terme : chaque échéance a été réglée.
   *
   * Un échéancier vide ne l'est pas — c'est un investissement dont
   * l'échéancier n'a pas encore été généré, pas une dette éteinte.
   */
  get estIntegralementRembourse(): boolean {
    return (
      !this.estVide &&
      this._echeances.every((e) => e.statut === EcheanceStatus.PAYE)
    );
  }

  /** L'état complet, pour la persistance et la présentation. */
  snapshot(): EcheanceSnapshot[] {
    return this._echeances.map((e) => e.snapshot());
  }
}

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
