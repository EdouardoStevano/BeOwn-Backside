export const PIECE_JUSTIFICATIVE_STORAGE = Symbol(
  'PIECE_JUSTIFICATIVE_STORAGE',
);

/** Ce que le magasin rend une fois les octets rangés. */
export interface PieceRangee {
  /** Clé du magasin — ce qui permettra de relire ou de supprimer. */
  cleStockage: string;
  /** Adresse de lecture ; jamais publique pour un justificatif. */
  url: string;
}

/**
 * Où ranger les octets d'un justificatif de conformité.
 *
 * **Un port propre à ce contexte**, et non l'emprunt de celui de `documents`.
 * Ce n'est pas de la cérémonie : les pièces de conformité ont des règles que
 * les documents signables n'ont pas — conservation de cinq ans (RG-KYC-10),
 * accès réservé à l'équipe conformité et au titulaire, jamais de publication.
 * Ces règles appartiennent à ce port ; l'adaptateur qui écrit les octets, lui,
 * peut être partagé, puisqu'il ne connaît qu'un nom, un type MIME et un tableau
 * d'octets (§20).
 *
 * `stocker` ne rend pas de fichier : c'est `FichierDepose` qui décide si ce qui
 * a été déposé est recevable, et il vit dans le domaine.
 */
export interface PieceJustificativeStorage {
  /**
   * Range les octets et rend de quoi les retrouver.
   *
   * @param societeId sert à ranger les pièces d'une même société ensemble —
   *   utile à l'exploitation, et surtout à une purge par société le jour où la
   *   durée de conservation est atteinte.
   */
  stocker(fichier: {
    contenu: Buffer;
    nomOrigine: string;
    mimeType: string;
    societeId: string;
  }): Promise<PieceRangee>;
}
