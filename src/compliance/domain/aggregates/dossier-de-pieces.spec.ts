import { ChampProfilInvalideError } from '../errors';
import {
  BeneficiaireDeLaPieceIncoherentError,
  PieceJustificativeIntrouvableError,
} from '../errors/piece-justificative.errors';
import { TypePieceJustificative } from '../enums/type-piece-justificative.enum';
import { PieceJustificative } from '../entities/piece-justificative';
import { DecisionPiece } from '../value-objects/decision-piece.vo';
import { FichierDepose } from '../value-objects/fichier-depose.vo';
import { DossierDePieces } from './dossier-de-pieces';

const SOCIETE = 'societe-1';
const BENEFICIAIRE = 'beneficiaire-1';

const AUJOURD_HUI = new Date('2026-08-28T10:00:00.000Z');

const fichier = () =>
  FichierDepose.depose({
    nomOrigine: 'kbis.pdf',
    cleStockage: 'conformite/societes/societe-1/kbis',
    url: 'https://exemple/kbis.pdf',
    mimeType: 'application/pdf',
    tailleOctets: 12_000,
  });

/**
 * Un dossier tel que le repository le recharge : ses pièces ont une identité.
 *
 * C'est l'état dans lequel une pièce est instruite — on ne tranche jamais un
 * dépôt qui n'a pas encore été enregistré. Passer par `deposer` ici donnerait
 * des pièces sans `id`, que `piece()` refuse justement de retrouver.
 */
function dossierAvec(
  depots: {
    type: TypePieceJustificative;
    beneficiaireId?: string | null;
    dateEmission?: Date | null;
  }[],
): DossierDePieces {
  return new DossierDePieces({
    societeId: SOCIETE,
    pieces: depots.map(
      (depot, rang) =>
        new PieceJustificative({
          entete: {
            id: `piece-${rang + 1}`,
            type: depot.type,
            beneficiaireId: depot.beneficiaireId ?? null,
            dateEmission: depot.dateEmission ?? null,
            deposeeLe: AUJOURD_HUI,
          },
          fichier: fichier(),
          decision: DecisionPiece.enAttente(),
        }),
    ),
  });
}

/** Les quatre pièces de la société, toutes acceptées et fraîches. */
function dossierComplet(): DossierDePieces {
  const dossier = dossierAvec([
    { type: TypePieceJustificative.KBIS, dateEmission: new Date('2026-08-01') },
    { type: TypePieceJustificative.STATUTS },
    { type: TypePieceJustificative.LISTE_ACTIONNAIRES },
    { type: TypePieceJustificative.DBE_S1 },
  ]);
  for (const piece of dossier.pieces) {
    dossier.accepterLaPiece(piece.id, AUJOURD_HUI);
  }
  return dossier;
}

describe('DossierDePieces — le dépôt', () => {
  it('remplace la pièce qui documentait déjà la même chose', () => {
    // Redéposer un KBIS n'en crée pas un second : un dossier ne doit pas
    // accumuler des extraits contradictoires dont aucun ne fait foi.
    const dossier = dossierAvec([{ type: TypePieceJustificative.KBIS }]);

    dossier.deposer({
      type: TypePieceJustificative.KBIS,
      beneficiaireId: null,
      dateEmission: null,
      fichier: fichier(),
      maintenant: AUJOURD_HUI,
    });

    expect(dossier.pieces).toHaveLength(1);
  });

  it('laisse coexister les pièces de deux bénéficiaires distincts', () => {
    // « La même chose » se juge sur le type **et** le bénéficiaire : il n'y a
    // qu'un KBIS par société, mais autant de pièces d'identité que de
    // personnes déclarées.
    const dossier = DossierDePieces.vierge(SOCIETE);
    for (const beneficiaireId of ['b-1', 'b-2']) {
      dossier.deposer({
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId,
        dateEmission: null,
        fichier: fichier(),
        maintenant: AUJOURD_HUI,
      });
    }

    expect(dossier.pieces).toHaveLength(2);
  });

  it("refuse d'instruire une pièce qui n'a pas encore été enregistrée", () => {
    // Son identité est attribuée par la persistance. Sans ce garde-fou,
    // chercher par un identifiant vide ferait correspondre `undefined ===
    // undefined` : on instruirait une pièce pour une autre.
    const dossier = DossierDePieces.vierge(SOCIETE);
    const nouvelle = dossier.deposer({
      type: TypePieceJustificative.KBIS,
      beneficiaireId: null,
      dateEmission: null,
      fichier: fichier(),
      maintenant: AUJOURD_HUI,
    });

    expect(nouvelle.id).toBeUndefined();
    expect(() => dossier.accepterLaPiece(nouvelle.id)).toThrow(
      PieceJustificativeIntrouvableError,
    );
  });

  it("remet l'instruction en attente quand une pièce refusée est remplacée", () => {
    // C'est ce que fait le titulaire qui corrige. Sans ce retour à zéro, la
    // pièce resterait marquée refusée et le dossier n'avancerait jamais.
    const dossier = dossierAvec([{ type: TypePieceJustificative.KBIS }]);
    const piece = dossier.pieces[0];
    dossier.refuserLaPiece(piece.id, 'Extrait illisible', AUJOURD_HUI);

    dossier.deposer({
      type: TypePieceJustificative.KBIS,
      beneficiaireId: null,
      dateEmission: null,
      fichier: fichier(),
      maintenant: AUJOURD_HUI,
    });

    expect(piece.decision.estEnAttente()).toBe(true);
    expect(piece.decision.motifRefus).toBeNull();
  });

  it('exige un bénéficiaire pour sa pièce d’identité, et l’interdit ailleurs', () => {
    const dossier = DossierDePieces.vierge(SOCIETE);
    const depot =
      (type: TypePieceJustificative, beneficiaireId: string | null) => () =>
        dossier.deposer({
          type,
          beneficiaireId,
          dateEmission: null,
          fichier: fichier(),
          maintenant: AUJOURD_HUI,
        });

    expect(
      depot(TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE, null),
    ).toThrow(BeneficiaireDeLaPieceIncoherentError);
    expect(depot(TypePieceJustificative.KBIS, BENEFICIAIRE)).toThrow(
      BeneficiaireDeLaPieceIncoherentError,
    );
  });
});

describe('DossierDePieces — la complétude', () => {
  it('réclame les quatre pièces de la société tant que rien n’est déposé', () => {
    const dossier = DossierDePieces.vierge(SOCIETE);

    const manquantes = dossier.piecesManquantes([], AUJOURD_HUI);

    expect(manquantes).toHaveLength(4);
    expect(manquantes.every((m) => m.raison === 'absente')).toBe(true);
    expect(dossier.estComplet([], AUJOURD_HUI)).toBe(false);
  });

  it('ne compte pas une pièce déposée mais non instruite', () => {
    // Déposer n'est pas prouver : le dossier n'est complet qu'une fois les
    // pièces acceptées.
    const dossier = dossierAvec([
      {
        type: TypePieceJustificative.KBIS,
        dateEmission: new Date('2026-08-01'),
      },
      { type: TypePieceJustificative.STATUTS },
      { type: TypePieceJustificative.LISTE_ACTIONNAIRES },
      { type: TypePieceJustificative.DBE_S1 },
    ]);

    const manquantes = dossier.piecesManquantes([], AUJOURD_HUI);

    expect(manquantes).toHaveLength(4);
    expect(manquantes.every((m) => m.raison === 'en_attente')).toBe(true);
  });

  it('tient le dossier pour complet quand les quatre sont acceptées', () => {
    expect(dossierComplet().estComplet([], AUJOURD_HUI)).toBe(true);
  });

  it('exige une pièce d’identité par bénéficiaire déclaré', () => {
    // « Une pièce d'identité pour chacun de ces bénéficiaires » : leur nombre
    // fait partie de la règle, et il vient de l'appelant.
    const dossier = dossierComplet();

    const manquantes = dossier.piecesManquantes(['b-1', 'b-2'], AUJOURD_HUI);

    expect(manquantes).toHaveLength(2);
    expect(manquantes.map((m) => m.beneficiaireId)).toEqual(['b-1', 'b-2']);
  });

  it('dit pourquoi chaque pièce manque, pas seulement qu’elle manque', () => {
    // Le titulaire à qui il manque un KBIS et celui dont le KBIS vient d'être
    // refusé n'ont pas le même geste à faire.
    const dossier = dossierComplet();
    const kbis = dossier.pieces.find(
      (p) => p.type === TypePieceJustificative.KBIS,
    )!;
    dossier.refuserLaPiece(
      kbis.id,
      'Extrait de plus de trois mois',
      AUJOURD_HUI,
    );

    const manquantes = dossier.piecesManquantes([], AUJOURD_HUI);

    expect(manquantes).toEqual([
      {
        type: TypePieceJustificative.KBIS,
        beneficiaireId: null,
        raison: 'refusee',
      },
    ]);
  });
});

describe('DossierDePieces — la fraîcheur du KBIS', () => {
  it('cesse de compter un KBIS accepté mais vieux de plus de trois mois', () => {
    // Sans cette règle, un dossier serait définitivement complet au premier
    // passage — or un extrait atteste d'une immatriculation à une date, et une
    // société peut être radiée le lendemain.
    const dossier = dossierComplet();

    const dansSixMois = new Date('2027-02-28T10:00:00.000Z');
    const manquantes = dossier.piecesManquantes([], dansSixMois);

    expect(manquantes).toEqual([
      {
        type: TypePieceJustificative.KBIS,
        beneficiaireId: null,
        raison: 'perimee',
      },
    ]);
  });

  it('mesure la fraîcheur sur la date d’émission, pas celle du dépôt', () => {
    // Redéposer en août un extrait émis en janvier ne le rajeunit pas.
    const dossier = dossierAvec([
      {
        type: TypePieceJustificative.KBIS,
        dateEmission: new Date('2026-01-05'),
      },
    ]);
    const kbis = dossier.pieces[0];
    dossier.accepterLaPiece(kbis.id, AUJOURD_HUI);

    expect(kbis.estPerimee(AUJOURD_HUI)).toBe(true);
  });

  it('tient pour périmé un KBIS accepté sans date d’émission', () => {
    // On ne peut pas prouver sa fraîcheur ; le régime protecteur veut qu'on ne
    // la présume pas.
    const dossier = dossierAvec([{ type: TypePieceJustificative.KBIS }]);
    const kbis = dossier.pieces[0];
    dossier.accepterLaPiece(kbis.id, AUJOURD_HUI);

    expect(kbis.estPerimee(AUJOURD_HUI)).toBe(true);
  });

  it('ne périme jamais une pièce sans durée de validité', () => {
    // Les statuts sont demandés « à jour » : c'est une exigence de contenu, pas
    // de date. Leur opposer une péremption refuserait un dossier valide.
    const dossier = dossierAvec([{ type: TypePieceJustificative.STATUTS }]);
    const statuts = dossier.pieces[0];
    dossier.accepterLaPiece(statuts.id, AUJOURD_HUI);

    expect(statuts.estPerimee(new Date('2030-01-01'))).toBe(false);
  });
});

describe('DossierDePieces — l’instruction', () => {
  it('exige un motif pour refuser', () => {
    // « Votre document est refusé » n'aide personne à le corriger.
    const dossier = dossierAvec([{ type: TypePieceJustificative.KBIS }]);
    const piece = dossier.pieces[0];

    expect(() => dossier.refuserLaPiece(piece.id, '   ', AUJOURD_HUI)).toThrow(
      ChampProfilInvalideError,
    );
  });

  it('efface le motif quand la pièce est finalement acceptée', () => {
    const dossier = dossierAvec([{ type: TypePieceJustificative.KBIS }]);
    const piece = dossier.pieces[0];
    dossier.refuserLaPiece(piece.id, 'Illisible', AUJOURD_HUI);

    dossier.accepterLaPiece(piece.id, AUJOURD_HUI);

    expect(piece.decision.motifRefus).toBeNull();
  });

  it('refuse d’instruire une pièce qui n’est pas de ce dossier', () => {
    // Sans ce passage par la racine, l'identifiant d'une pièce d'une autre
    // société suffirait à la trancher.
    const dossier = dossierComplet();

    expect(() => dossier.accepterLaPiece('piece-dailleurs')).toThrow(
      PieceJustificativeIntrouvableError,
    );
  });

  it('liste les pièces à corriger, motif à l’appui', () => {
    const dossier = dossierComplet();
    const statuts = dossier.pieces.find(
      (p) => p.type === TypePieceJustificative.STATUTS,
    )!;
    dossier.refuserLaPiece(statuts.id, 'Non signés', AUJOURD_HUI);

    const refusees = dossier.piecesRefusees();

    expect(refusees).toHaveLength(1);
    expect(refusees[0].decision.motifRefus).toBe('Non signés');
  });
});
