import {
  exigeUnVersoDIdentite,
  TypePieceIdentite,
} from '../enums/type-piece-identite.enum';
import { VersoDeLaPieceIdentiteIncoherentError } from '../errors/piece-identite.errors';
import { FichierDepose, FichierDeposeSnapshot } from './fichier-depose.vo';

/**
 * La pièce d'identité telle que la colonne `jsonb` la range.
 *
 * Un objet imbriqué, à la différence des justificatifs de société qui sont
 * rangés à plat en colonnes : ici rien ne se filtre ni ne se trie — on lit ce
 * document pour l'instruire, jamais pour chercher parmi d'autres. La table
 * `kyc` fait déjà ce choix pour `identiteExtrait`, et pour la même raison.
 */
export interface PieceIdentiteDeposeeSnapshot {
  type: TypePieceIdentite;
  recto: FichierDeposeSnapshot;
  verso: FichierDeposeSnapshot | null;
  /** Instant du dépôt, en ISO — le `jsonb` ne connaît pas les `Date`. */
  deposeeLe: string;
}

/**
 * Le document d'identité que le titulaire dépose lui-même, pour qu'un humain
 * l'examine.
 *
 * **C'est le recours quand l'automatique n'a pas abouti.** Stripe Identity
 * tranche seul dans le cas normal, et le cahier des charges veut qu'il reste la
 * source faisant foi : c'est pourquoi `TypePieceJustificative` exclut
 * explicitement la pièce du titulaire, pour ne pas créer deux sources d'un même
 * fait. Cette exclusion vaut tant que le fournisseur a **su** décider. Quand il
 * refuse ou renvoie le dossier en revue, il n'y a plus de source du tout, et
 * l'équipe conformité n'a rien à lire : le dépôt manuel est ce qui lui donne de
 * quoi trancher.
 *
 * Un **Value Object**, et non une entité : il n'a pas d'identité propre, pas de
 * cycle de vie hors du dossier qui le porte, et il n'y en a qu'un — redéposer,
 * c'est remplacer, jamais accumuler. L'instruction reste celle du dossier
 * (`DecisionKyc`), pas celle de la pièce : le RCCI valide **une identité**, pas
 * un fichier. C'est la différence avec `PieceJustificative`, qui est une entité
 * parce qu'un dossier de société en porte plusieurs, chacune tranchée à part.
 *
 * **Immuable** — cf. `Identite`. Corriger un document, ce n'est pas modifier
 * celui-ci, c'est en déposer un autre.
 */
export class PieceIdentiteDeposee {
  private constructor(
    private readonly _type: TypePieceIdentite,
    private readonly _recto: FichierDepose,
    private readonly _verso: FichierDepose | null,
    private readonly _deposeeLe: Date,
  ) {}

  /**
   * Dépôt d'un document, éprouvé.
   *
   * La seule règle est celle du verso, et elle dépend du type : seule la carte
   * nationale d'identité porte au dos la date d'expiration sans laquelle on ne
   * peut pas dire que la pièce est encore valide. Les trois autres se prouvent
   * d'une seule page.
   *
   * Les bornes du fichier — type MIME, taille, clé non vide — sont éprouvées par
   * {@link FichierDepose}, en amont : ce Value Object-ci ne connaît que la
   * composition du document.
   *
   * @throws VersoDeLaPieceIdentiteIncoherentError
   */
  static deposer(champs: {
    type: TypePieceIdentite;
    recto: FichierDepose;
    verso?: FichierDepose | null;
    maintenant?: Date;
  }): PieceIdentiteDeposee {
    const verso = champs.verso ?? null;
    const attendu = exigeUnVersoDIdentite(champs.type);

    if (attendu !== (verso !== null)) {
      throw new VersoDeLaPieceIdentiteIncoherentError(champs.type, attendu);
    }

    return new PieceIdentiteDeposee(
      champs.type,
      champs.recto,
      verso,
      champs.maintenant ?? new Date(),
    );
  }

  /** Reconstitution depuis la persistance, sans contrôle (cf. `CodePays`). */
  static restore(snapshot: PieceIdentiteDeposeeSnapshot): PieceIdentiteDeposee {
    return new PieceIdentiteDeposee(
      snapshot.type,
      FichierDepose.restore(snapshot.recto),
      snapshot.verso ? FichierDepose.restore(snapshot.verso) : null,
      new Date(snapshot.deposeeLe),
    );
  }

  get type(): TypePieceIdentite {
    return this._type;
  }
  get recto(): FichierDepose {
    return this._recto;
  }
  /** `null` pour un passeport, qui n'a qu'une page de données. */
  get verso(): FichierDepose | null {
    return this._verso;
  }
  get deposeeLe(): Date {
    return this._deposeeLe;
  }

  toSnapshot(): PieceIdentiteDeposeeSnapshot {
    return {
      type: this._type,
      recto: this._recto.toSnapshot(),
      verso: this._verso?.toSnapshot() ?? null,
      deposeeLe: this._deposeeLe.toISOString(),
    };
  }
}
