import {
  DepotDePhoto,
  PhotoProjet,
  PhotoProjetSnapshot,
} from '../entities/photo-projet';
import {
  PhotoDeProjetIntrouvableError,
  PositionDePhotoInvalideError,
} from '../errors/contenu-projet.errors';

/**
 * **La galerie d'un projet** — sa vignette de couverture et ses vues, dans
 * l'ordre où la fiche les présente.
 *
 * Même dessin que {@link BlocsDeContenu}, et pour les mêmes raisons : un Value
 * Object immuable, dont la position d'une photo **est** son rang dans la liste,
 * jamais une colonne. Elle tient un invariant de plus, et c'est celui qui
 * justifiait à lui seul de rapatrier les images dans `catalog` :
 *
 * > **Une seule vignette par projet, et exactement une dès qu'il y a une photo.**
 *
 * Personne ne le tenait. Dans `documents`, chaque photo était un agrégat
 * distinct : aucune ne pouvait savoir si une autre était déjà couverture, et le
 * repository rattrapait cela par deux `UPDATE` — décoiffer toutes les photos du
 * projet, puis en couronner une. Deux écritures non atomiques, dans un adapter
 * de sortie, pour un invariant du domaine (§6, §17).
 *
 * **La galerie ne le tient pas mieux : elle le rend impossible à enfreindre.**
 * `estPrincipale` n'est pas un état que l'on pose et qu'il faudrait ensuite
 * garder unique — *la vignette est la photo de rang 0*. Il n'y a donc rien à
 * synchroniser : l'unicité est une propriété d'un tableau, pas une règle à
 * faire respecter. C'est aussi ce qui garantit qu'il n'existe **qu'un seul
 * ordre** — celui de la liste. L'ancien modèle en avait deux, le rang stocké
 * (`ordre`) et l'affichage (couverture d'abord), qui pouvaient se contredire.
 *
 * Trois conséquences, toutes voulues :
 *
 * - la **première photo déposée est la vignette**, sans que personne ait à la
 *   désigner — une fiche n'attend pas une action d'administration pour avoir
 *   une illustration ;
 * - **désigner une vignette, c'est la mettre en tête** ({@link designantCouverture}
 *   délègue à {@link deplacant}). L'ancienne est décoiffée par construction ;
 * - **retirer la vignette promeut la suivante**, sans code pour cela : le rang 0
 *   se recomble. C'était le trou le plus visible de l'ancien modèle — un
 *   `DELETE /documents/:id` sur la principale laissait la fiche sans aucune.
 */
export class GalerieProjet {
  private constructor(private readonly photos: readonly PhotoProjet[]) {}

  static vide(): GalerieProjet {
    return new GalerieProjet([]);
  }

  /**
   * Reconstitution depuis la colonne `jsonb`.
   *
   * **Normalise la vignette** au lieu de relire le drapeau aveuglément : les
   * lignes reprises de la table `document` peuvent en compter zéro ou plusieurs
   * — rien ne l'y empêchait — et celle qui la portait n'était pas
   * nécessairement d'`ordre` 0. La première marquée est donc ramenée au rang 0 ;
   * à défaut, celle qui s'y trouve déjà l'est. Une reprise de données ne doit
   * pas installer un état que la galerie refuserait de produire.
   */
  static restore(
    etat: readonly PhotoProjetSnapshot[] | null | undefined,
  ): GalerieProjet {
    // @see BlocsDeContenu.restore — pourquoi on repasse par le type déclaré.
    const lignes: readonly PhotoProjetSnapshot[] = Array.isArray(etat)
      ? etat
      : [];

    const rangees = [...lignes]
      .filter((brut) => brut && typeof brut.id === 'string')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const marquee = rangees.findIndex((brut) => brut.estPrincipale === true);
    if (marquee > 0) {
      const [vignette] = rangees.splice(marquee, 1);
      rangees.unshift(vignette);
    }

    return new GalerieProjet(rangees.map((brut) => PhotoProjet.restore(brut)));
  }

  get nombre(): number {
    return this.photos.length;
  }

  /** La vignette du projet — la photo de rang 0 —, ou `null` si la galerie est vide. */
  get couverture(): PhotoProjet | null {
    return this.photos[0] ?? null;
  }

  /**
   * Ajoute une photo en fin de galerie. Si c'est la première, elle occupe le
   * rang 0 et devient donc la vignette — voir la note de classe.
   */
  ajoutant(depot: DepotDePhoto): GalerieProjet {
    return new GalerieProjet([...this.photos, PhotoProjet.deposer(depot)]);
  }

  /**
   * Désigne la vignette du projet : la photo passe en tête, et l'ancienne
   * vignette cesse d'en être une du seul fait d'avoir reculé d'un rang.
   *
   * @throws PhotoDeProjetIntrouvableError
   */
  designantCouverture(photoId: string): GalerieProjet {
    return this.deplacant(photoId, 0);
  }

  /** @throws PhotoDeProjetIntrouvableError */
  decrivant(photoId: string, texteAlternatif: string | null): GalerieProjet {
    const index = this.indexDe(photoId);
    const suite = [...this.photos];
    suite[index] = suite[index].avecTexteAlternatif(texteAlternatif);
    return new GalerieProjet(suite);
  }

  /**
   * Déplace une photo à un nouveau rang.
   *
   * Déplacer **vers** le rang 0 fait de cette photo la vignette, et en déplacer
   * une **hors** du rang 0 en promeut une autre : c'est la même opération que
   * {@link designantCouverture}, et c'est voulu — il n'y a qu'un ordre, donc
   * qu'une manière de changer de vignette.
   *
   * @throws PhotoDeProjetIntrouvableError, PositionDePhotoInvalideError
   */
  deplacant(photoId: string, position: number): GalerieProjet {
    const index = this.indexDe(photoId);
    const max = this.photos.length - 1;
    if (!Number.isInteger(position) || position < 0 || position > max) {
      throw new PositionDePhotoInvalideError(position, max);
    }

    const suite = [...this.photos];
    const [photo] = suite.splice(index, 1);
    suite.splice(position, 0, photo);
    return new GalerieProjet(suite);
  }

  /**
   * Retire une photo. Si c'était la vignette, la suivante prend le rang 0 —
   * donc la vignette — sans qu'aucune ligne de code ici ne s'en occupe.
   *
   * @returns la galerie sans elle, **et** la clé de stockage à effacer — le
   *   domaine ne supprime aucun fichier (§20), mais il est le seul à savoir
   *   laquelle n'est plus référencée.
   * @throws PhotoDeProjetIntrouvableError
   */
  sans(photoId: string): { galerie: GalerieProjet; cleLiberee: string } {
    const index = this.indexDe(photoId);
    const suite = [...this.photos];
    const [retiree] = suite.splice(index, 1);

    return {
      galerie: new GalerieProjet(suite),
      cleLiberee: retiree.cleStockage,
    };
  }

  private indexDe(photoId: string): number {
    const index = this.photos.findIndex((photo) => photo.id === photoId);
    if (index === -1) throw new PhotoDeProjetIntrouvableError(photoId);
    return index;
  }

  /**
   * L'état publié : la vignette d'abord, puis les vues.
   *
   * Aucun tri ici, et c'est le point : la liste **est** déjà dans cet ordre.
   * `ProjectReadModelService.photosPubliques` reclassait des documents à chaque
   * lecture parce que le rang et la couverture y étaient deux colonnes
   * indépendantes ; ici la seconde se lit sur le premier.
   */
  toSnapshot(): PhotoProjetSnapshot[] {
    return this.photos.map((photo, rang) => photo.toSnapshot(rang));
  }
}
