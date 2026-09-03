import { randomUUID } from 'node:crypto';
import {
  CorpsDeBlocRequisError,
  TitreDeBlocRequisError,
} from '../errors/contenu-projet.errors';

/** Longueur au-delà de laquelle un titre de bloc cesse d'être un titre. */
const LONGUEUR_MAX_TITRE = 200;

/** État d'un bloc, tel qu'il transite depuis/vers la persistance et le JSON. */
export interface BlocDeContenuSnapshot {
  id: string;
  titre: string;
  /**
   * Le champ de texte enrichi, en HTML — c'est ce que rendent les éditeurs
   * WYSIWYG du back-office.
   */
  corps: string;
  /**
   * Rang d'affichage dans la fiche, à partir de 0.
   *
   * ⚠️ Dérivé, pas stocké : c'est {@link BlocsDeContenu} qui le pose au moment
   * de rendre l'état, précisément pour qu'il ne puisse pas mentir. Un bloc seul
   * n'a pas de position — il n'en a une que dans la suite qui le contient.
   */
  position: number;
}

/** Ce qu'un administrateur fournit pour écrire un bloc. */
export interface ChampsDeBloc {
  titre: string;
  corps: string;
}

/**
 * **Bloc de contenu** — un pavé éditorial de la fiche projet : un titre, un
 * rang d'affichage et un champ de texte enrichi.
 *
 * Une **entité**, et non un Value Object (§7/§8) : deux blocs peuvent porter le
 * même titre et le même corps sans être le même bloc, et l'administrateur en
 * modifie *un* — il faut donc pouvoir le désigner. D'où l'identifiant, qui est
 * tiré ici et non en base : les blocs vivent dans une colonne `jsonb` du projet,
 * où Postgres ne génère aucune clé.
 *
 * Une entité **interne à l'agrégat** {@link Project}, pas une racine (§6.1) :
 * un bloc n'existe que par le projet qui le publie, ne se charge jamais seul, et
 * son invariant réel — l'unicité et la continuité des positions — porte sur la
 * suite entière, pas sur le bloc. C'est {@link BlocsDeContenu} qui le tient.
 *
 * **Immuable** : {@link avec} rend un nouveau bloc plutôt que de se réécrire,
 * comme {@link Chronologie}. La collection peut ainsi se recomposer sans jamais
 * qu'un bloc à moitié modifié subsiste si une règle rejette la suite.
 */
export class BlocDeContenu {
  private constructor(
    private readonly _id: string,
    private readonly _titre: string,
    private readonly _corps: string,
  ) {}

  /**
   * Écrit un nouveau bloc. L'identifiant est tiré ici — voir la note de classe.
   *
   * @throws TitreDeBlocRequisError si le titre est vide ou trop long
   * @throws CorpsDeBlocRequisError si le texte enrichi est vide
   */
  static ecrire(champs: ChampsDeBloc): BlocDeContenu {
    return new BlocDeContenu(
      randomUUID(),
      exigerTitre(champs.titre),
      exigerCorps(champs.corps),
    );
  }

  /**
   * Reconstitution depuis la persistance.
   *
   * Ne rejoue pas les invariants, pour la raison que {@link ProjectMapper}
   * énonce : une fiche qu'on ne peut plus relire est pire qu'une fiche
   * imparfaite. `position` est ignorée — la suite la repose.
   */
  static restore(etat: {
    id: string;
    titre: string;
    corps: string;
  }): BlocDeContenu {
    return new BlocDeContenu(etat.id, etat.titre, etat.corps);
  }

  /**
   * Réécrit ce bloc. `undefined` laisse le champ en place — même convention que
   * {@link Project.modifier}.
   */
  avec(champs: Partial<ChampsDeBloc>): BlocDeContenu {
    return new BlocDeContenu(
      this._id,
      champs.titre !== undefined ? exigerTitre(champs.titre) : this._titre,
      champs.corps !== undefined ? exigerCorps(champs.corps) : this._corps,
    );
  }

  get id(): string {
    return this._id;
  }

  get titre(): string {
    return this._titre;
  }

  get corps(): string {
    return this._corps;
  }

  /** @param position rang posé par la suite qui contient ce bloc. */
  toSnapshot(position: number): BlocDeContenuSnapshot {
    return {
      id: this._id,
      titre: this._titre,
      corps: this._corps,
      position,
    };
  }
}

function exigerTitre(titre: string): string {
  const propre = titre?.trim();
  if (!propre || propre.length > LONGUEUR_MAX_TITRE) {
    throw new TitreDeBlocRequisError(LONGUEUR_MAX_TITRE);
  }
  return propre;
}

/**
 * Le corps n'est ni nettoyé ni tronqué : c'est du texte enrichi, et l'assainir
 * ici — retirer des balises, réécrire des attributs — reviendrait à décider dans
 * le domaine d'une règle de sécurité qui appartient au rendu. Seul le vide est
 * refusé : un bloc sans texte n'est pas un bloc.
 */
function exigerCorps(corps: string): string {
  if (!corps || !corps.trim()) throw new CorpsDeBlocRequisError();
  return corps;
}
