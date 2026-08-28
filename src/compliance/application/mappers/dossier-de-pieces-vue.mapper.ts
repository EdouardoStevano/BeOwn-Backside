import {
  DossierDePieces,
  PieceManquante,
} from 'src/compliance/domain/aggregates/dossier-de-pieces';
import { PieceJustificativeSnapshot } from 'src/compliance/domain/entities/piece-justificative';
import {
  LIBELLE_PIECE,
  TypePieceJustificative,
} from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { StatutPiece } from 'src/compliance/domain/value-objects/decision-piece.vo';
import { BeneficiaireDeclare } from '../ports/beneficiaires-de-la-societe.query';

/** Ce qui manque, dit de manière affichable. */
export interface PieceManquantePubliee extends PieceManquante {
  libelle: string;
  /** Nom du bénéficiaire concerné, `null` pour une pièce de la société. */
  beneficiaire: string | null;
}

/** Un fichier tel qu'un client peut l'afficher ou le télécharger. */
export interface VueFichier {
  nomOrigine: string;
  url: string;
  mimeType: string;
  tailleOctets: number;
}

/** Ce que l'instruction a décidé — et rien de ce qu'elle n'a pas décidé. */
export interface VueInstruction {
  statut: StatutPiece;
  /** Présent seulement sur un refus : c'est ce qui dit quoi corriger. */
  motifRefus?: string;
  /** Présent seulement une fois la pièce tranchée. */
  decideeLe?: Date;
}

/**
 * Une pièce justificative telle qu'elle se publie.
 *
 * **Ce n'est pas `PieceJustificativeSnapshot`, et c'est tout l'objet.** Le
 * snapshot est la forme de la **table** : dix-huit clés à plat, dont dix pour
 * deux fichiers et cinq qui valent `null` sur quatre pièces sur cinq. Le rendre
 * tel quel faisait sortir la persistance par l'API (§16), et obligeait le
 * client à lire `versoNomOrigine: null` pour apprendre qu'un KBIS n'a pas de
 * dos — ce que son type disait déjà.
 *
 * Deux principes, et ils suffisent :
 *
 * - **ce qui ne s'applique pas est absent, jamais `null`.** Un KBIS n'a ni
 *   bénéficiaire, ni verso, ni motif de refus ; les rendre à `null` demande au
 *   client de distinguer « pas encore » de « sans objet », distinction que rien
 *   ne l'aide à faire ;
 * - **ce qui va ensemble est groupé.** `fichier` et `verso` sont des objets,
 *   pas dix clés préfixées. C'est aussi ce qui rend le verso représentable :
 *   « absent » se dit par l'absence de la clé, pas par cinq `null` coordonnés.
 *
 * `cleStockage` n'y figure pas : c'est la clé interne du magasin, elle ne sert
 * qu'au serveur pour relire les octets, et la publier dirait à tout titulaire
 * comment le stockage est rangé.
 */
export interface VuePieceJustificative {
  id: string;
  type: TypePieceJustificative;
  /** Le nom métier de la pièce — évite au client de tenir sa propre table. */
  libelle: string;
  deposeeLe: Date;
  fichier: VueFichier;
  /** Absent pour tout ce qui n'a pas de dos — cf. `PIECES_RECTO_VERSO`. */
  verso?: VueFichier;
  /** Absents pour une pièce de la société : elle ne documente personne. */
  beneficiaireId?: string;
  beneficiaire?: string;
  /** Absente pour les types sans durée de validité — cf. `VALIDITE_EN_MOIS`. */
  dateEmission?: Date;
  instruction: VueInstruction;
}

/**
 * L'état du dossier de pièces d'une société.
 *
 * Trois informations, et la troisième est celle qui manquait partout : la
 * liste des pièces déposées avec leur statut, ce qui manque encore **avec sa
 * raison**, et le verdict d'ensemble.
 *
 * La raison compte autant que la liste. Le titulaire à qui il manque un KBIS et
 * celui dont le KBIS vient d'être refusé n'ont pas le même geste à faire ;
 * un écran qui dirait « KBIS manquant » à quelqu'un qui vient d'en déposer un
 * serait incompréhensible. Les libellés voyagent avec — c'est une projection
 * destinée à l'affichage, et séparer le libellé de l'état qu'il décrit
 * obligerait à tenir la correspondance à deux endroits (cf. `OnboardingStatus`).
 */
export interface VueDossierDePieces {
  societeId: string;
  pieces: VuePieceJustificative[];
  manquantes: PieceManquantePubliee[];
  estComplet: boolean;
}

/**
 * Une pièce, telle qu'elle se publie.
 *
 * Construite depuis le **snapshot** et non depuis l'entité, bien que celle-ci
 * dise plus directement ce qu'on cherche : `DossierDePieces.pieces` est une
 * porte réservée au repository, et s'en servir pour composer une vue rendrait
 * les entités modifiables hors de leur racine — exactement ce que cette porte
 * documente refuser (§6). Le snapshot, lui, est de la donnée : il ne se
 * modifie pas, et son seul défaut était d'être **publié** tel quel.
 *
 * @param nomsParId les bénéficiaires de la société, pour nommer celui que la
 *   pièce documente. Un identifiant seul n'aide pas le titulaire à savoir de
 *   quelle personne il s'agit — même raison que sur les pièces manquantes.
 */
export function vuePiece(
  piece: PieceJustificativeSnapshot,
  nomsParId: ReadonlyMap<string, string> = new Map(),
): VuePieceJustificative {
  const nom = piece.beneficiaireId
    ? nomsParId.get(piece.beneficiaireId)
    : undefined;

  return {
    id: piece.id,
    type: piece.type,
    libelle: LIBELLE_PIECE[piece.type],
    deposeeLe: piece.deposeeLe,
    fichier: {
      nomOrigine: piece.nomOrigine,
      url: piece.url,
      mimeType: piece.mimeType,
      tailleOctets: piece.tailleOctets,
    },
    // Les blocs conditionnels sont **répandus** plutôt qu'affectés à `null` :
    // c'est ce qui fait disparaître la clé au lieu de la rendre vide.
    ...(verso(piece) ?? {}),
    ...(piece.beneficiaireId !== null
      ? {
          beneficiaireId: piece.beneficiaireId,
          ...(nom !== undefined ? { beneficiaire: nom } : {}),
        }
      : {}),
    ...(piece.dateEmission !== null
      ? { dateEmission: piece.dateEmission }
      : {}),
    instruction: {
      statut: piece.statut,
      // `DecisionPiece` garantit déjà qu'un motif ne survit pas à une
      // acceptation ; ce que la vue ajoute, c'est de ne pas publier la clé du
      // tout — un `motifRefus: null` invite l'écran à réserver une place pour
      // un texte qui n'existera jamais.
      ...(piece.motifRefus !== null ? { motifRefus: piece.motifRefus } : {}),
      ...(piece.decideeLe !== null ? { decideeLe: piece.decideeLe } : {}),
    },
  };
}

/**
 * Le verso recomposé depuis ses cinq colonnes, ou rien.
 *
 * `cleStockage` sert de témoin — la seule colonne sans laquelle les octets
 * seraient introuvables, donc la seule qui distingue un dos déposé d'un dos
 * absent. Même critère que le mapper de persistance, et pour la même raison :
 * une ligne à moitié écrite ne doit pas passer pour un document.
 */
function verso(
  piece: PieceJustificativeSnapshot,
): { verso: VueFichier } | null {
  if (!piece.versoCleStockage) return null;

  return {
    verso: {
      nomOrigine: piece.versoNomOrigine ?? '',
      url: piece.versoUrl ?? '',
      mimeType: piece.versoMimeType ?? '',
      tailleOctets: piece.versoTailleOctets ?? 0,
    },
  };
}

export function vueDossierDePieces(
  dossier: DossierDePieces,
  beneficiaires: readonly BeneficiaireDeclare[],
  maintenant: Date = new Date(),
): VueDossierDePieces {
  const nomsParId = new Map(
    beneficiaires.map((b) => [b.id, `${b.prenom} ${b.nom}`.trim()]),
  );

  const manquantes = dossier
    .piecesManquantes(
      beneficiaires.map((b) => b.id),
      maintenant,
    )
    .map((manquante) => ({
      ...manquante,
      libelle: LIBELLE_PIECE[manquante.type],
      beneficiaire:
        manquante.beneficiaireId === null
          ? null
          : (nomsParId.get(manquante.beneficiaireId) ?? null),
    }));

  return {
    societeId: dossier.societeId,
    pieces: dossier.piecesPubliees.map((piece) => vuePiece(piece, nomsParId)),
    manquantes,
    // Déduit de la même liste, et non recalculé : deux appels à la règle
    // pourraient se contredire si l'horloge tourne entre les deux.
    estComplet: manquantes.length === 0,
  };
}
