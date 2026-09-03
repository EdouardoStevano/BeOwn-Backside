export const PROJECT_PHOTO_STORAGE = Symbol('PROJECT_PHOTO_STORAGE');

/** Le fichier tel qu'il arrive du téléversement, avant tout stockage. */
export interface FichierImage {
  contenu: Buffer;
  nomOriginal: string;
  mimeType: string;
  tailleOctets: number;
}

/** Ce que le stockage rend une fois l'image écrite. */
export interface ImageStockee {
  /** Clé de l'objet — ce qu'il faut pour l'effacer. */
  cleStockage: string;
  /** URL de lecture, servie par le CDN. */
  url: string;
}

/**
 * **Le stockage des photos de projet, vu depuis `catalog`** (§20, §33).
 *
 * Un port **propre à ce contexte**, et non le `CloudStorageService` partagé
 * appelé directement — c'est la règle que §20 énonce pour les pièces KYC et les
 * documents signés : chaque contexte définit son port à son propre niveau
 * métier, quand bien même l'adaptateur derrière serait le même. Ce port-ci ne
 * parle que d'images publiques de fiche projet ; il n'a ni durée de rétention
 * légale, ni URL signée à durée de vie, parce qu'une photo de catalogue n'en a
 * pas — là où `KycDocumentStoragePort` a les cinq ans de RG-KYC-10.
 *
 * Il ne connaît donc ni Cloudinary, ni « dossier », ni « ressource brute ou
 * image » : ce sont des notions du fournisseur, que
 * `CloudinaryProjectPhotoAdapter` traduit.
 */
export interface ProjectPhotoStorage {
  /**
   * Écrit une image et rend de quoi la relire et l'effacer.
   *
   * Toujours en accès public : une photo de fiche est faite pour être vue sans
   * authentification, y compris par le site public (§3.3, *Separate Ways*).
   */
  deposer(fichier: FichierImage): Promise<ImageStockee>;

  /**
   * Efface une image.
   *
   * N'échoue pas si l'objet n'existe plus : le domaine a déjà retiré la photo
   * de la galerie quand cet appel survient, et faire échouer la requête pour un
   * fichier déjà absent laisserait l'administrateur devant une erreur pour une
   * suppression qui a bien eu lieu.
   */
  effacer(cleStockage: string): Promise<void>;
}
