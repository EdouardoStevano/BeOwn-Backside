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
/**
 * À qui appartient la pièce rangée.
 *
 * **Ce n'est pas un détail de chemin, c'est ce qui rend la purge possible.** La
 * conservation de cinq ans (RG-KYC-10) se compte par dossier, et un dossier est
 * soit celui d'une société — ses justificatifs — soit celui d'un titulaire —
 * la pièce d'identité qu'il dépose pour la revue manuelle. Les ranger ensemble
 * obligerait, à l'échéance, à ouvrir chaque objet pour savoir de qui il relève.
 *
 * Une union et non deux champs optionnels : `{ societeId, titulaireId }` tous
 * deux nuls, ou tous deux renseignés, sont deux états que rien n'aurait
 * empêchés d'écrire (même raison que `ProfilInvestisseur`).
 */
export type ProprietaireDeLaPiece =
  | { societeId: string }
  | { titulaireId: number };

export interface PieceJustificativeStorage {
  /**
   * Range les octets et rend de quoi les retrouver.
   *
   * @param proprietaire décide du rangement, et donc de ce qu'une purge saura
   *   retrouver — voir {@link ProprietaireDeLaPiece}.
   */
  stocker(fichier: {
    contenu: Buffer;
    nomOrigine: string;
    mimeType: string;
    proprietaire: ProprietaireDeLaPiece;
  }): Promise<PieceRangee>;
}
