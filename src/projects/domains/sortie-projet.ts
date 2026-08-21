import { StatutSortie } from './enums/statut-sortie.enum';
import {
  SortieDejaDistribueeError,
  TransitionSortieInvalideError,
} from './errors/sortie.errors';
import { SortieProjetMapper } from './mappers/sortie-projet.mapper';

/**
 * État complet de la sortie, tel qu'il transite depuis/vers la persistance et
 * tel qu'il est publié. Clés inchangées : les routes `/admin/sorties/*` rendent
 * le même JSON.
 */
export interface SortieProjetSnapshot {
  id: string;
  projetId: string;
  prixRevente: number;
  dateRevente: Date;
  plusValueBrute: number;
  statut: StatutSortie;
  acteVentePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Événement de sortie : la revente du bien détenu par la SCI, pour un projet
 * en equity.
 *
 * Invariants :
 *
 * - `plusValueBrute = prixRevente − capitalCible`, arrondie au centime. Elle
 *   peut être négative — une moins-value est un résultat, pas une erreur ;
 * - le cycle de vie est `PROJETEE → ACTEE → DISTRIBUEE`, `ANNULEE` restant
 *   accessible tant que rien n'a été versé.
 *
 * Ce cycle était épelé **dans la couche présentation** : `AdminSortiesController`
 * vérifiait le statut courant par un `if`, puis écrivait `s.statut =
 * StatutSortie.ACTEE` et rappelait le repository (§12.5). Trois copies de la
 * même règle, dont une dans `ExecuteSortieUseCase`. Elles vivent maintenant
 * dans {@link marquerActee}, {@link annuler} et {@link marquerDistribuee}, qui
 * sont les seules manières de changer l'état d'une sortie.
 *
 * Naître appartient à {@link SortieProjetFactory} — c'est là que se calcule la
 * plus-value, et que se décide le statut de départ selon qu'un acte de vente
 * accompagne ou non la déclaration.
 */
export class SortieProjet {
  private _statut: StatutSortie;
  private _acteVentePdfUrl: string | null;
  private readonly _entete: Omit<
    SortieProjetSnapshot,
    'statut' | 'acteVentePdfUrl'
  >;

  /** @internal Réservé à `SortieProjetFactory` et `SortieProjetMapper`. */
  constructor(etat: SortieProjetSnapshot) {
    const { statut, acteVentePdfUrl, ...entete } = etat;
    this._statut = statut;
    this._acteVentePdfUrl = acteVentePdfUrl;
    this._entete = entete;
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  /**
   * L'acte de vente est signé : le prix est encaissé, la distribution devient
   * possible. Seule une sortie `PROJETEE` peut être actée.
   */
  marquerActee(acteVentePdfUrl: string): void {
    if (this._statut !== StatutSortie.PROJETEE) {
      throw new TransitionSortieInvalideError(
        this._statut,
        StatutSortie.PROJETEE,
        StatutSortie.ACTEE,
      );
    }
    this._statut = StatutSortie.ACTEE;
    this._acteVentePdfUrl = acteVentePdfUrl;
  }

  /**
   * La distribution vient d'être versée. Seule une sortie `ACTEE` peut l'être :
   * distribuer une sortie `PROJETEE` verserait le produit d'une vente qui n'a
   * pas eu lieu, et rejouer une sortie `DISTRIBUEE` paierait deux fois.
   */
  marquerDistribuee(): void {
    if (this._statut !== StatutSortie.ACTEE) {
      throw new TransitionSortieInvalideError(
        this._statut,
        StatutSortie.ACTEE,
        StatutSortie.DISTRIBUEE,
      );
    }
    this._statut = StatutSortie.DISTRIBUEE;
  }

  /** Annulation, possible tant que rien n'a été versé aux investisseurs. */
  annuler(): void {
    if (this._statut === StatutSortie.DISTRIBUEE) {
      throw new SortieDejaDistribueeError();
    }
    this._statut = StatutSortie.ANNULEE;
  }

  // ── Règles propres à la sortie ────────────────────────────────────────────

  /**
   * Une sortie qui occupe le projet : elle interdit d'en déclarer une seconde.
   *
   * Tout sauf `ANNULEE` — la liste était épelée en trois comparaisons dans
   * `DeclareSortieUseCase`, ce qui la rendait muette sur son intention et
   * fausse au prochain statut ajouté.
   */
  get occupeLeProjet(): boolean {
    return this._statut !== StatutSortie.ANNULEE;
  }

  get estActee(): boolean {
    return this._statut === StatutSortie.ACTEE;
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  get id(): string {
    return this._entete.id;
  }
  get projetId(): string {
    return this._entete.projetId;
  }
  get prixRevente(): number {
    return this._entete.prixRevente;
  }
  get dateRevente(): Date {
    return this._entete.dateRevente;
  }
  get plusValueBrute(): number {
    return this._entete.plusValueBrute;
  }
  get statut(): StatutSortie {
    return this._statut;
  }
  get acteVentePdfUrl(): string | null {
    return this._acteVentePdfUrl;
  }
  get createdAt(): Date {
    return this._entete.createdAt;
  }
  get updatedAt(): Date {
    return this._entete.updatedAt;
  }

  /** @see Project.toJSON */
  toJSON(): SortieProjetSnapshot {
    return this.toSnapshot();
  }

  toSnapshot(): SortieProjetSnapshot {
    return SortieProjetMapper.toSnapshot(this);
  }
}
