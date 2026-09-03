import {
  BlocDeContenu,
  BlocDeContenuSnapshot,
  ChampsDeBloc,
} from '../entities/bloc-de-contenu';
import {
  BlocDeContenuIntrouvableError,
  PositionDeBlocInvalideError,
  ReordonnancementIncompletError,
} from '../errors/contenu-projet.errors';

/**
 * **La suite des blocs éditoriaux d'une fiche projet** — « autant de blocs que
 * l'administrateur le souhaite », et l'ordre dans lequel ils se lisent.
 *
 * Un Value Object (§8) : cette suite n'a pas d'identité propre — c'est *le
 * contenu du projet* —, elle est définie par ce qu'elle contient, et elle est
 * immuable. Chaque opération rend une nouvelle suite ; l'agrégat remplace la
 * sienne, ou ne la remplace pas si une règle a rejeté l'opération. C'est le
 * dessin de {@link Chronologie}, pour la même raison : rien ne doit pouvoir
 * subsister d'une modification refusée.
 *
 * **L'invariant qu'elle tient, et que nul bloc ne peut tenir seul** : les
 * positions sont exactement `0 … n-1`, sans trou ni doublon. Il est tenu par
 * construction plutôt que par contrôle — la position n'est jamais stockée sur un
 * bloc, elle est **le rang dans cette liste**, et {@link toSnapshot} la pose au
 * moment de rendre l'état. Une position ne peut donc pas dériver de l'ordre
 * réel : il n'y a qu'une source.
 *
 * C'est aussi pourquoi il n'existe aucun `blocs[]` public sur le projet :
 * exposer le tableau rendrait l'invariant réécrivable de l'extérieur (§6).
 */
export class BlocsDeContenu {
  private constructor(private readonly blocs: readonly BlocDeContenu[]) {}

  static vide(): BlocsDeContenu {
    return new BlocsDeContenu([]);
  }

  /**
   * Reconstitution depuis la colonne `jsonb`.
   *
   * Tolérante à ce qu'elle peut réellement contenir : `null` sur les lignes
   * antérieures au défaut `[]`, et toute valeur qui n'est pas un tableau — même
   * garde que {@link Chronologie.restore}. L'ordre stocké fait foi ; le champ
   * `position` des lignes est relu pour trier, puis oublié.
   */
  static restore(
    etat: readonly Partial<BlocDeContenuSnapshot>[] | null | undefined,
  ): BlocsDeContenu {
    // `Array.isArray` élargit à `any[]` : on repasse par le type déclaré, la
    // garde ne servant qu'à écarter ce que la colonne pourrait contenir de
    // travers. Même précaution que `Chronologie.restore`.
    const lignes: readonly Partial<BlocDeContenuSnapshot>[] = Array.isArray(
      etat,
    )
      ? etat
      : [];

    const blocs = [...lignes]
      .filter((brut) => brut && typeof brut.id === 'string')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((brut) =>
        BlocDeContenu.restore({
          id: brut.id!,
          titre: brut.titre ?? '',
          corps: brut.corps ?? '',
        }),
      );

    return new BlocsDeContenu(blocs);
  }

  get nombre(): number {
    return this.blocs.length;
  }

  /**
   * Ajoute un bloc, à la fin par défaut.
   *
   * @param position rang visé ; les blocs suivants reculent d'un cran. Absente,
   *   le bloc se pose en dernier — le cas courant de la rédaction d'une fiche.
   * @throws PositionDeBlocInvalideError si la position est hors de `0 … n`
   */
  ajoutant(champs: ChampsDeBloc, position?: number): BlocsDeContenu {
    const bloc = BlocDeContenu.ecrire(champs);
    const rang = position ?? this.blocs.length;
    this.exigerPositionRecevable(rang, this.blocs.length);

    const suite = [...this.blocs];
    suite.splice(rang, 0, bloc);
    return new BlocsDeContenu(suite);
  }

  /**
   * Réécrit le titre et/ou le corps d'un bloc, sans toucher à son rang.
   *
   * @throws BlocDeContenuIntrouvableError
   */
  modifiant(blocId: string, champs: Partial<ChampsDeBloc>): BlocsDeContenu {
    const index = this.indexDe(blocId);
    const suite = [...this.blocs];
    suite[index] = suite[index].avec(champs);
    return new BlocsDeContenu(suite);
  }

  /**
   * Déplace un bloc à un nouveau rang. Les autres se resserrent d'eux-mêmes :
   * c'est l'intérêt de ne pas stocker les positions.
   *
   * @throws BlocDeContenuIntrouvableError, PositionDeBlocInvalideError
   */
  deplacant(blocId: string, position: number): BlocsDeContenu {
    const index = this.indexDe(blocId);
    this.exigerPositionRecevable(position, this.blocs.length - 1);

    const suite = [...this.blocs];
    const [bloc] = suite.splice(index, 1);
    suite.splice(position, 0, bloc);
    return new BlocsDeContenu(suite);
  }

  /**
   * Réordonne la suite entière, dans l'ordre des identifiants donnés — ce que
   * fait un glisser-déposer du back-office.
   *
   * Exige la liste **complète** : accepter une liste partielle obligerait à
   * inventer une place pour les blocs omis, et le premier réordonnancement
   * incomplet ferait disparaître silencieusement un pavé de la fiche.
   *
   * @throws ReordonnancementIncompletError si les identifiants ne sont pas
   *   exactement ceux de la suite
   */
  reordonnee(idsDansLOrdre: readonly string[]): BlocsDeContenu {
    const attendus = new Set(this.blocs.map((b) => b.id));
    const recus = new Set(idsDansLOrdre);

    if (
      recus.size !== idsDansLOrdre.length ||
      recus.size !== attendus.size ||
      idsDansLOrdre.some((id) => !attendus.has(id))
    ) {
      throw new ReordonnancementIncompletError(
        [...attendus],
        [...idsDansLOrdre],
      );
    }

    const parId = new Map(this.blocs.map((b) => [b.id, b]));
    return new BlocsDeContenu(idsDansLOrdre.map((id) => parId.get(id)!));
  }

  /** @throws BlocDeContenuIntrouvableError */
  sans(blocId: string): BlocsDeContenu {
    const index = this.indexDe(blocId);
    const suite = [...this.blocs];
    suite.splice(index, 1);
    return new BlocsDeContenu(suite);
  }

  private indexDe(blocId: string): number {
    const index = this.blocs.findIndex((bloc) => bloc.id === blocId);
    if (index === -1) throw new BlocDeContenuIntrouvableError(blocId);
    return index;
  }

  private exigerPositionRecevable(position: number, max: number): void {
    if (!Number.isInteger(position) || position < 0 || position > max) {
      throw new PositionDeBlocInvalideError(position, max);
    }
  }

  /** L'état publié : les blocs dans l'ordre, chacun portant son rang. */
  toSnapshot(): BlocDeContenuSnapshot[] {
    return this.blocs.map((bloc, rang) => bloc.toSnapshot(rang));
  }
}
