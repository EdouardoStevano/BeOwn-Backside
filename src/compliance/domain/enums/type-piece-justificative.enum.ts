import {
  exigeUnVersoDIdentite,
  TypePieceIdentite,
} from './type-piece-identite.enum';

/**
 * Les pièces qu'un dossier personne morale doit réunir.
 *
 * Elles se répartissent en deux familles, et c'est **ce que la pièce documente**
 * qui décide — pas son format ni qui la dépose :
 *
 * | Famille                          | Ce qu'elle documente          | Combien           |
 * | -------------------------------- | ----------------------------- | ----------------- |
 * | {@link PIECES_EXIGEES_DE_LA_SOCIETE} | l'entreprise elle-même    | une par société   |
 * | {@link PIECES_EXIGEES_DU_BENEFICIAIRE} | une personne qui la contrôle | une par bénéficiaire |
 *
 * Le KBIS, les statuts et la liste des actionnaires décrivent la société :
 * l'extrait atteste **son** immatriculation, les statuts **ses** règles de
 * fonctionnement, la liste **son** actionnariat pris comme un tout. Aucun ne se
 * rattache à une personne, et vouloir en rattacher un ferait exister autant de
 * KBIS que de bénéficiaires sans qu'on sache lequel fait foi.
 *
 * Le DBE-S1 et la pièce d'identité, eux, désignent **une personne nommée**. Le
 * DBE-S1 est le document relatif au bénéficiaire effectif : il s'en dépose un
 * par personne déclarée, pas un par société — trois actionnaires à 30 % font
 * trois formulaires.
 *
 * La pièce d'identité du **titulaire** ne figure dans aucune des deux,
 * délibérément : son identité est vérifiée par le parcours hébergé du
 * fournisseur (`StripeIdentityAdapter`), qui capture et contrôle la pièce
 * lui-même. Un dépôt manuel en parallèle créerait deux sources pour un même
 * fait, dont une seule fait foi auprès du régulateur.
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
 * Trois documents qui décrivent l'entreprise : son immatriculation, ses
 * statuts, son actionnariat. Leur compte ne dépend de rien — d'où une
 * constante, là où les pièces des bénéficiaires se comptent à l'exécution.
 */
export const PIECES_EXIGEES_DE_LA_SOCIETE: readonly TypePieceJustificative[] = [
  TypePieceJustificative.KBIS,
  TypePieceJustificative.STATUTS,
  TypePieceJustificative.LISTE_ACTIONNAIRES,
];

/**
 * Les pièces exigées pour **chaque** bénéficiaire effectif déclaré.
 *
 * Leur nombre dépend donc de la société : deux documents multipliés par le
 * nombre de personnes au registre. C'est `DossierDePieces.piecesManquantes` qui
 * fait ce produit, la liste des bénéficiaires lui étant passée par l'appelant —
 * elle appartient à `RegistreDesBeneficiaires`, pas ici (§6.2).
 *
 * Le DBE-S1 y a rejoint la pièce d'identité : il était compté parmi les pièces
 * de la société, ce qui n'en réclamait **qu'un seul** quel que soit le nombre
 * d'actionnaires — un dossier de trois bénéficiaires passait pour complet avec
 * le formulaire d'un seul d'entre eux.
 */
export const PIECES_EXIGEES_DU_BENEFICIAIRE: readonly TypePieceJustificative[] =
  [
    TypePieceJustificative.DBE_S1,
    TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
  ];

/**
 * Cette pièce doit-elle désigner le bénéficiaire effectif qu'elle documente ?
 *
 * La question se pose au dépôt, et la réponse est exactement l'appartenance à
 * {@link PIECES_EXIGEES_DU_BENEFICIAIRE} : une pièce qui compte *par personne*
 * doit dire laquelle, une pièce qui compte *par société* ne le peut pas.
 *
 * Une fonction plutôt qu'un test sur un type unique, comme c'était écrit dans
 * `DossierDePieces.deposer` : l'égalité à `PIECE_IDENTITE_BENEFICIAIRE` était
 * juste tant qu'une seule pièce était nominative, et fausse dès que le DBE-S1
 * l'est devenu.
 */
export function exigeUnBeneficiaire(type: TypePieceJustificative): boolean {
  return PIECES_EXIGEES_DU_BENEFICIAIRE.includes(type);
}

/**
 * Cette pièce doit-elle dire **quel document d'identité** elle est ?
 *
 * Une seule le doit : la pièce d'identité du bénéficiaire. Un KBIS est un KBIS,
 * mais « pièce d'identité » ne désigne pas un document — c'est une famille de
 * quatre, et ils ne se prouvent pas de la même façon.
 *
 * Le type reste **unique** malgré ces quatre natures, et c'est délibéré : la
 * règle de complétude en réclame *une* par bénéficiaire, quelle qu'elle soit.
 * Quatre types d'enum auraient obligé `piecesManquantes` à exprimer « l'un de
 * ces quatre », ou pire, à les réclamer tous les quatre.
 */
export function exigeUneNatureDIdentite(type: TypePieceJustificative): boolean {
  return type === TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE;
}

/**
 * Le **verso** fait-il partie de ce document ?
 *
 * La question ne se pose que pour la pièce d'identité d'un bénéficiaire, et sa
 * réponse ne dépend pas du type mais de la **nature** : seule la carte
 * nationale d'identité porte au dos la date d'expiration et la bande MRZ. Le
 * passeport, le permis de conduire et le titre de séjour se prouvent d'une
 * seule page.
 *
 * La table qui tranche est {@link PIECES_IDENTITE_RECTO_VERSO}, partagée avec
 * le dépôt manuel du **titulaire** — c'est le même jeu de quatre documents, et
 * les mêmes raisons. Deux tables séparées auraient fini par diverger : un
 * passeport accepté sans verso d'un côté, refusé de l'autre.
 *
 * Recto et verso restent **une seule pièce** avec **une seule décision** :
 * l'équipe conformité accepte ou refuse un document d'identité, pas une face.
 */
export function exigeUnVerso(
  type: TypePieceJustificative,
  natureIdentite: TypePieceIdentite | null,
): boolean {
  if (!exigeUneNatureDIdentite(type)) return false;

  return natureIdentite !== null && exigeUnVersoDIdentite(natureIdentite);
}

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
  [TypePieceJustificative.DBE_S1]: 'formulaire DBE-S1 du bénéficiaire effectif',
  [TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE]:
    "pièce d'identité du bénéficiaire effectif",
};
