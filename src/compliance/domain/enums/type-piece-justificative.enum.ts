/**
 * Les pièces qu'un dossier personne morale doit réunir.
 *
 * Le cahier des charges en énumère quatre, et les nomme comme le fait le
 * registre : *« KBIS de moins de 3 mois, Statuts à jour et signés, Liste des
 * actionnaires à jour »*, plus le *« formulaire DBE-S1 rempli »* au titre des
 * bénéficiaires effectifs. S'y ajoute la pièce d'identité de **chacun** de ces
 * bénéficiaires — la seule dont il existe autant d'exemplaires que de personnes
 * déclarées, et donc la seule qui porte un `beneficiaireId`.
 *
 * La pièce d'identité du **titulaire** n'y figure pas, délibérément : son
 * identité est vérifiée par le parcours hébergé du fournisseur
 * (`StripeIdentityAdapter`), qui capture et contrôle la pièce lui-même. Un
 * dépôt manuel en parallèle créerait deux sources pour un même fait, dont une
 * seule fait foi auprès du régulateur.
 */
export enum TypePieceJustificative {
  KBIS = 'kbis',
  STATUTS = 'statuts',
  LISTE_ACTIONNAIRES = 'liste_actionnaires',
  DBE_S1 = 'dbe_s1',
  PIECE_IDENTITE_BENEFICIAIRE = 'piece_identite_beneficiaire',
}

/**
 * Les pièces exigées une fois par société, quelle que soit sa composition.
 *
 * `PIECE_IDENTITE_BENEFICIAIRE` en est absente : il en faut une **par
 * bénéficiaire déclaré**, donc leur compte dépend de la société et ne peut pas
 * s'écrire dans une constante. Voir `DossierDePieces.piecesManquantes`.
 */
export const PIECES_EXIGEES_DE_LA_SOCIETE: readonly TypePieceJustificative[] = [
  TypePieceJustificative.KBIS,
  TypePieceJustificative.STATUTS,
  TypePieceJustificative.LISTE_ACTIONNAIRES,
  TypePieceJustificative.DBE_S1,
];

/**
 * Durée au-delà de laquelle une pièce ne prouve plus rien, en mois.
 *
 * **Seul le KBIS en a une**, et le cahier des charges la fixe à trois mois :
 * l'extrait atteste d'une immatriculation à une date, et une société peut être
 * radiée le lendemain. Les statuts et la liste des actionnaires sont demandés
 * « à jour », ce qui est une exigence de contenu et non de date — un statut de
 * 2019 jamais modifié depuis est parfaitement à jour, et lui opposer une
 * péremption refuserait un dossier valide.
 *
 * Une table plutôt qu'un `if` sur le KBIS : le jour où le régulateur date une
 * seconde pièce, la règle s'ajoute ici et `PieceJustificative.estPerimee` n'est
 * pas rouverte (§4 — Open/Closed).
 */
export const VALIDITE_EN_MOIS: Partial<Record<TypePieceJustificative, number>> =
  {
    [TypePieceJustificative.KBIS]: 3,
  };

/** Libellés rendus au titulaire dans les messages d'erreur et les listes. */
export const LIBELLE_PIECE: Record<TypePieceJustificative, string> = {
  [TypePieceJustificative.KBIS]: 'extrait KBIS',
  [TypePieceJustificative.STATUTS]: 'statuts à jour et signés',
  [TypePieceJustificative.LISTE_ACTIONNAIRES]: 'liste des actionnaires à jour',
  [TypePieceJustificative.DBE_S1]: 'formulaire DBE-S1',
  [TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE]:
    "pièce d'identité du bénéficiaire effectif",
};
