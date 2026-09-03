import { randomUUID } from 'node:crypto';
import { ImageDeProjetInvalideError } from '../errors/contenu-projet.errors';

/** Formats acceptés pour l'illustration d'une fiche projet. */
export const TYPES_IMAGE_ACCEPTES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** État d'une photo, tel qu'il transite depuis/vers la persistance et le JSON. */
export interface PhotoProjetSnapshot {
  id: string;
  /** URL de lecture rendue par le stockage objet — ce que le front affiche. */
  url: string;
  /**
   * Clé de l'objet dans le stockage. C'est elle qu'il faut pour le supprimer,
   * et elle seule : l'URL est dérivée, et peut changer de forme.
   */
  cleStockage: string;
  /** Nom du fichier tel que l'administrateur l'a déposé. */
  nomOriginal: string;
  mimeType: string;
  tailleOctets: number;
  /** Texte alternatif — accessibilité et référencement de la fiche publique. */
  texteAlternatif: string | null;
  /**
   * Image de couverture du projet : la vignette.
   *
   * ⚠️ Dérivé, et c'est tout l'intérêt : **la vignette est la photo de rang 0**.
   * Ce n'est donc pas un état que l'on pose, mais une lecture de l'ordre — d'où
   * il découle qu'il y en a exactement une dès que la galerie n'est pas vide, et
   * jamais deux. Le champ reste dans l'état publié parce que le front le lit.
   */
  estPrincipale: boolean;
  /**
   * Rang d'affichage dans la galerie, à partir de 0.
   *
   * ⚠️ Dérivé, comme celui d'un bloc : c'est {@link GalerieProjet} qui le pose.
   */
  position: number;
  deposeePar: number;
  deposeeLe: Date;
}

/** Ce que le dépôt d'un fichier apporte, une fois le stockage écrit. */
export interface DepotDePhoto {
  url: string;
  cleStockage: string;
  nomOriginal: string;
  mimeType: string;
  tailleOctets: number;
  texteAlternatif?: string | null;
  deposeePar: number;
  deposeeLe?: Date;
}

/**
 * **Photo de projet** — une image de la fiche : vignette de couverture ou vue
 * de la galerie.
 *
 * Elle appartenait au contexte `documents`, comme une `PHOTO_PROJET` parmi les
 * types de `SignableDocument`. Elle n'y avait pas sa place, et le nom de cet
 * agrégat le disait déjà : ce contexte existe parce que certaines pièces
 * *engagent juridiquement celui qui les signe* — un bulletin de souscription, un
 * acte de cession, un KIIS. Une photo de façade ne se signe pas. Elle est du
 * **contenu éditorial**, au même titre qu'un {@link BlocDeContenu}, et le
 * cycle de vie commercial de la fiche est ce que `catalog` modélise (§3.2, M4).
 *
 * Le déplacement règle au passage un vrai défaut de conception : « une seule
 * image principale par projet » est un invariant qui porte sur **toutes** les
 * photos d'un projet. Aucun `SignableDocument` ne pouvait le tenir seul, et le
 * repository le rattrapait par deux `UPDATE` successifs — un `WHERE projectId`
 * qui décoiffait toutes les autres, puis la désignation. Deux écritures non
 * atomiques pour un invariant, dans un adapter de sortie.
 *
 * Ici, il n'y a plus d'invariant à tenir : **la vignette est la photo de rang
 * 0** de {@link GalerieProjet}. Une photo ne porte donc aucun drapeau
 * `estPrincipale` — le champ du même nom dans son état publié se *calcule* au
 * moment de rendre la galerie. C'est ce qui garantit qu'il n'y en a jamais deux,
 * et qu'il n'existe qu'un seul ordre : celui de la liste.
 *
 * **Immuable**, comme {@link BlocDeContenu} et pour la même raison.
 */
export class PhotoProjet {
  private constructor(
    private readonly _id: string,
    private readonly _fichier: Omit<
      PhotoProjetSnapshot,
      'id' | 'estPrincipale' | 'position'
    >,
  ) {}

  /**
   * Enregistre une photo qui vient d'être téléversée.
   *
   * Le fichier lui-même est déjà dans le stockage : le domaine ne connaît ni
   * `Buffer`, ni Cloudinary (§20) — seulement la clé et l'URL que l'adapter lui
   * rend. `estPrincipale` n'est pas un paramètre, et ne peut pas l'être : la
   * vignette est la photo de rang 0, donc une propriété de la galerie, pas de
   * la photo.
   *
   * @throws ImageDeProjetInvalideError si le format n'est pas une image
   */
  static deposer(depot: DepotDePhoto): PhotoProjet {
    if (!TYPES_IMAGE_ACCEPTES.includes(depot.mimeType)) {
      throw new ImageDeProjetInvalideError(depot.mimeType);
    }

    return new PhotoProjet(randomUUID(), {
      url: depot.url,
      cleStockage: depot.cleStockage,
      nomOriginal: depot.nomOriginal,
      mimeType: depot.mimeType,
      tailleOctets: depot.tailleOctets,
      texteAlternatif: depot.texteAlternatif ?? null,
      deposeePar: depot.deposeePar,
      deposeeLe: depot.deposeeLe ?? new Date(),
    });
  }

  /**
   * Reconstitution depuis la persistance. N'éprouve pas le format : les lignes
   * reprises de la table `document` portent ce qui y avait été accepté.
   */
  static restore(
    etat: Omit<PhotoProjetSnapshot, 'estPrincipale' | 'position'> &
      Partial<Pick<PhotoProjetSnapshot, 'estPrincipale' | 'position'>>,
  ): PhotoProjet {
    // Champ par champ, et non par décomposition : ni `position` ni
    // `estPrincipale` n'entrent ici — la galerie les repose toutes deux depuis
    // le rang, et les recopier ferait exister deux sources pour un même fait.
    return new PhotoProjet(etat.id, {
      url: etat.url,
      cleStockage: etat.cleStockage,
      nomOriginal: etat.nomOriginal,
      mimeType: etat.mimeType,
      tailleOctets: etat.tailleOctets,
      texteAlternatif: etat.texteAlternatif ?? null,
      deposeePar: etat.deposeePar,
      deposeeLe: new Date(etat.deposeeLe),
    });
  }

  /** Réécrit le texte alternatif — le seul champ éditable d'une photo. */
  avecTexteAlternatif(texte: string | null): PhotoProjet {
    const propre = texte?.trim() || null;
    return new PhotoProjet(this._id, {
      ...this._fichier,
      texteAlternatif: propre,
    });
  }

  get id(): string {
    return this._id;
  }

  get url(): string {
    return this._fichier.url;
  }

  /** @see PhotoProjetSnapshot.cleStockage — ce qu'il faut pour la supprimer. */
  get cleStockage(): string {
    return this._fichier.cleStockage;
  }

  /**
   * @param position rang posé par la galerie qui contient cette photo — et dont
   *   `estPrincipale` se déduit, la vignette étant la photo de rang 0.
   */
  toSnapshot(position: number): PhotoProjetSnapshot {
    return {
      id: this._id,
      ...this._fichier,
      estPrincipale: position === 0,
      position,
    };
  }
}
