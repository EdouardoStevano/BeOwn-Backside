/**
 * Les documents avec lesquels un titulaire peut prouver son identité **à la
 * main**, quand la vérification automatique n'a pas abouti.
 *
 * Ce sont les quatre que l'équipe conformité accepte d'instruire elle-même :
 * *« Carte d'identité R/V, Passeport, Permis de conduire ou Titre de séjour »*.
 * Aucun autre — un justificatif de domicile ou une carte vitale ne prouvent pas
 * une identité, et les accepter reviendrait à laisser l'instruction décider au
 * cas par cas de ce qui fait foi.
 *
 * **Distinct de `TypePieceJustificative`**, et les deux ne doivent pas fusionner
 * malgré la ressemblance. Ils ne documentent ni la même chose ni la même
 * personne : celui-ci prouve l'identité du **titulaire** pour son propre KYC,
 * l'autre réunit les justificatifs d'une **société** et de ses bénéficiaires.
 * Ils n'ont ni le même cycle d'instruction — `DecisionKyc` d'un côté,
 * `DecisionPiece` de l'autre — ni la même règle de complétude. Un enum commun
 * aurait rendu possible de déposer un KBIS au titre d'une pièce d'identité.
 */
export enum TypePieceIdentite {
  CARTE_IDENTITE = 'carte_identite',
  PASSEPORT = 'passeport',
  PERMIS_CONDUIRE = 'permis_conduire',
  TITRE_SEJOUR = 'titre_sejour',
}

/**
 * Les documents dont le **verso** fait partie de la preuve.
 *
 * **La carte nationale d'identité, et elle seule.** C'est le seul des quatre
 * dont la face avant ne suffit pas : la date d'expiration et la bande MRZ sont
 * au dos, et l'instruire sur son seul recto reviendrait à accepter un document
 * sans pouvoir vérifier qu'il est encore valide.
 *
 * Les trois autres se prouvent d'une seule page. Le passeport porte tout sur sa
 * page de données ; le permis de conduire et le titre de séjour portent au recto
 * l'identité, la photo et la validité que l'instruction regarde. Leur réclamer
 * un dos n'aurait ajouté aucune garantie — seulement un document de plus à
 * fournir, et un motif de refus de plus.
 *
 * Une table plutôt qu'un `if`, pour la raison qui vient de servir : la règle a
 * changé sans que `DossierDePieces`, `PieceIdentiteDeposee` ni aucune route
 * soient rouverts (§4 — Open/Closed).
 */
export const PIECES_IDENTITE_RECTO_VERSO: ReadonlySet<TypePieceIdentite> =
  new Set([TypePieceIdentite.CARTE_IDENTITE]);

/** @see PIECES_IDENTITE_RECTO_VERSO */
export function exigeUnVersoDIdentite(type: TypePieceIdentite): boolean {
  return PIECES_IDENTITE_RECTO_VERSO.has(type);
}

/** Libellés rendus au titulaire dans les messages d'erreur et à l'écran. */
export const LIBELLE_PIECE_IDENTITE: Record<TypePieceIdentite, string> = {
  [TypePieceIdentite.CARTE_IDENTITE]: "carte nationale d'identité",
  [TypePieceIdentite.PASSEPORT]: 'passeport',
  [TypePieceIdentite.PERMIS_CONDUIRE]: 'permis de conduire',
  [TypePieceIdentite.TITRE_SEJOUR]: 'titre de séjour',
};
