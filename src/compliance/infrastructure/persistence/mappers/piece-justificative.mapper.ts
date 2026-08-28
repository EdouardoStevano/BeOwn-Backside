import { PieceJustificative } from 'src/compliance/domain/entities/piece-justificative';
import { DecisionPiece } from 'src/compliance/domain/value-objects/decision-piece.vo';
import { FichierDepose } from 'src/compliance/domain/value-objects/fichier-depose.vo';
import { PieceJustificativeEntity } from '../entities/piece-justificative.entity';

/**
 * Traductions entre la pièce justificative et sa ligne.
 *
 * Même rôle et mêmes raisons que `ProfilMapper` : la forme de stockage peut
 * changer sans que l'entité soit rouverte (§16).
 */
export class PieceJustificativeOrmMapper {
  /**
   * Reconstitution depuis la persistance, **sans contrôle** : une ligne écrite
   * avant qu'une borne n'existe doit rester lisible — refuser au chargement
   * rendrait la pièce inaccessible, y compris pour la remplacer.
   *
   * `dateEmission` est relue tolérante : le driver rend une colonne `date` en
   * chaîne, malgré le type déclaré sur l'entité.
   */
  static toDomain(entity: PieceJustificativeEntity): PieceJustificative {
    return new PieceJustificative({
      entete: {
        id: entity.id,
        type: entity.type,
        beneficiaireId: entity.beneficiaireId,
        dateEmission: dateOuNull(entity.dateEmission),
        deposeeLe: entity.deposeeLe,
      },
      fichier: FichierDepose.restore({
        nomOrigine: entity.nomOrigine,
        cleStockage: entity.cleStockage,
        url: entity.url,
        mimeType: entity.mimeType,
        tailleOctets: Number(entity.tailleOctets),
      }),
      verso: versoOuNull(entity),
      decision: DecisionPiece.restore({
        statut: entity.statut,
        motifRefus: entity.motifRefus,
        decideeLe: entity.decideeLe,
      }),
    });
  }

  /** `societeId` vient du repository : la pièce ne connaît pas sa racine (§6). */
  static toEntity(
    piece: PieceJustificative,
    societeId: string,
  ): PieceJustificativeEntity {
    const snapshot = piece.toSnapshot();
    const entity = new PieceJustificativeEntity();

    // Absent d'un premier dépôt : l'uuid est généré en base.
    if (snapshot.id) entity.id = snapshot.id;
    entity.societeId = societeId;
    entity.type = snapshot.type;
    entity.beneficiaireId = snapshot.beneficiaireId;
    entity.nomOrigine = snapshot.nomOrigine;
    entity.cleStockage = snapshot.cleStockage;
    entity.url = snapshot.url;
    entity.mimeType = snapshot.mimeType;
    entity.tailleOctets = snapshot.tailleOctets;
    entity.versoNomOrigine = snapshot.versoNomOrigine;
    entity.versoCleStockage = snapshot.versoCleStockage;
    entity.versoUrl = snapshot.versoUrl;
    entity.versoMimeType = snapshot.versoMimeType;
    entity.versoTailleOctets = snapshot.versoTailleOctets;
    entity.dateEmission = snapshot.dateEmission;
    entity.statut = snapshot.statut;
    entity.motifRefus = snapshot.motifRefus;
    entity.decideeLe = snapshot.decideeLe;
    entity.deposeeLe = snapshot.deposeeLe;

    return entity;
  }
}

/** Le driver rend une colonne `date` en chaîne — cf. `ProfilPPSnapshotBrut`. */
function dateOuNull(valeur: Date | string | null): Date | null {
  if (valeur === null || valeur === undefined) return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Le verso, ou son absence.
 *
 * `cleStockage` sert de témoin : c'est la seule des cinq colonnes sans laquelle
 * les octets seraient introuvables, donc la seule qui distingue un dos déposé
 * d'un dos absent. Se fier au nom d'origine ou au type MIME laisserait passer
 * une ligne à moitié écrite comme si elle portait un document.
 *
 * Sans contrôle, comme le recto : une ligne écrite avant qu'une borne n'existe
 * doit rester lisible, y compris pour être remplacée.
 */
function versoOuNull(entity: PieceJustificativeEntity): FichierDepose | null {
  if (!entity.versoCleStockage) return null;

  return FichierDepose.restore({
    nomOrigine: entity.versoNomOrigine ?? '',
    cleStockage: entity.versoCleStockage,
    url: entity.versoUrl ?? '',
    mimeType: entity.versoMimeType ?? '',
    tailleOctets: Number(entity.versoTailleOctets ?? 0),
  });
}
