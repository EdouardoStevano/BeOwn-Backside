import {
  DossierDePieces,
  PieceManquante,
} from 'src/compliance/domain/aggregates/dossier-de-pieces';
import { PieceJustificativeSnapshot } from 'src/compliance/domain/entities/piece-justificative';
import { LIBELLE_PIECE } from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { BeneficiaireDeclare } from '../ports/beneficiaires-de-la-societe.query';

/** Ce qui manque, dit de manière affichable. */
export interface PieceManquantePubliee extends PieceManquante {
  libelle: string;
  /** Nom du bénéficiaire concerné, `null` pour une pièce de la société. */
  beneficiaire: string | null;
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
  pieces: PieceJustificativeSnapshot[];
  manquantes: PieceManquantePubliee[];
  estComplet: boolean;
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
    pieces: dossier.piecesPubliees,
    manquantes,
    // Déduit de la même liste, et non recalculé : deux appels à la règle
    // pourraient se contredire si l'horloge tourne entre les deux.
    estComplet: manquantes.length === 0,
  };
}
