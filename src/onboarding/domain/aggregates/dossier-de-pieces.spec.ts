import { ChampProfilInvalideError } from '../errors';
import {
  BeneficiaireDeLaPieceIncoherentError,
  NatureDeLaPieceIdentiteIncoherenteError,
  PieceJustificativeIntrouvableError,
  VersoDeLaPieceIncoherentError,
} from '../errors/piece-justificative.errors';
import {
  exigeUnVerso,
  TypePieceJustificative,
} from '../enums/type-piece-justificative.enum';
import { PieceJustificative } from '../entities/piece-justificative';
import { TypePieceIdentite } from '../enums/type-piece-identite.enum';
import { DecisionPiece } from '../value-objects/decision-piece.vo';
import { FichierDepose } from '../value-objects/fichier-depose.vo';
import { DossierDePieces } from './dossier-de-pieces';

const SOCIETE = 'societe-1';
const BENEFICIAIRE = 'beneficiaire-1';

const AUJOURD_HUI = new Date('2026-08-28T10:00:00.000Z');

/**
 * La nature du document, pour les seules pièces d'identité.
 *
 * La carte d'identité sert de cas nominal — recto-verso, comme trois documents
 * sur quatre. Le passeport, qui est l'exception, a ses tests dédiés.
 */
function natureDe(type: TypePieceJustificative): TypePieceIdentite | null {
  return type === TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE
    ? TypePieceIdentite.CARTE_IDENTITE
    : null;
}

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
            natureIdentite: natureDe(depot.type),
            dateEmission: depot.dateEmission ?? null,
            deposeeLe: AUJOURD_HUI,
          },
          fichier: fichier(),
          // Le dos suit le type, comme au dépôt : une pièce d'identité
          // reconstituée sans son verso ne serait pas un état que l'agrégat
          // sait produire.
          verso: exigeUnVerso(depot.type, natureDe(depot.type))
            ? fichier()
            : null,
          decision: DecisionPiece.enAttente(),
        }),
    ),
  });
}

/** Les trois pièces de la société, toutes acceptées et fraîches. */
function dossierComplet(): DossierDePieces {
  const dossier = dossierAvec([
    { type: TypePieceJustificative.KBIS, dateEmission: new Date('2026-08-01') },
    { type: TypePieceJustificative.STATUTS },
    { type: TypePieceJustificative.LISTE_ACTIONNAIRES },
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
        natureIdentite: TypePieceIdentite.CARTE_IDENTITE,
        fichier: fichier(),
        verso: fichier(),
        maintenant: AUJOURD_HUI,
      });
    }

    expect(dossier.pieces).toHaveLength(2);
  });

  it('laisse coexister les DBE-S1 de deux bénéficiaires distincts', () => {
    // Le formulaire est **nominatif** : il s'en dépose un par personne
    // déclarée. Compté une fois par société, un dossier de trois actionnaires
    // passait pour complet avec le formulaire d'un seul.
    const dossier = DossierDePieces.vierge(SOCIETE);
    for (const beneficiaireId of ['b-1', 'b-2']) {
      dossier.deposer({
        type: TypePieceJustificative.DBE_S1,
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

  it('exige un bénéficiaire pour les pièces nominatives, et l’interdit ailleurs', () => {
    // Ce que la pièce documente décide : le DBE-S1 et la pièce d'identité
    // désignent une personne, le KBIS et les statuts décrivent l'entreprise.
    const dossier = DossierDePieces.vierge(SOCIETE);
    const depot =
      (type: TypePieceJustificative, beneficiaireId: string | null) => () =>
        dossier.deposer({
          type,
          beneficiaireId,
          dateEmission: null,
          fichier: fichier(),
          verso: exigeUnVerso(type, natureDe(type)) ? fichier() : null,
          maintenant: AUJOURD_HUI,
        });

    // Nominatives, déposées sans dire qui elles documentent.
    expect(
      depot(TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE, null),
    ).toThrow(BeneficiaireDeLaPieceIncoherentError);
    expect(depot(TypePieceJustificative.DBE_S1, null)).toThrow(
      BeneficiaireDeLaPieceIncoherentError,
    );

    // De la société, rattachées à une personne.
    for (const type of [
      TypePieceJustificative.KBIS,
      TypePieceJustificative.STATUTS,
      TypePieceJustificative.LISTE_ACTIONNAIRES,
    ]) {
      expect(depot(type, BENEFICIAIRE)).toThrow(
        BeneficiaireDeLaPieceIncoherentError,
      );
    }
  });

  it('exige le verso d’une pièce d’identité, et l’interdit ailleurs', () => {
    // La date d'expiration est au dos : instruire sur le seul recto revient à
    // accepter un document sans pouvoir vérifier qu'il est encore valide.
    const dossier = DossierDePieces.vierge(SOCIETE);

    expect(() =>
      dossier.deposer({
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: BENEFICIAIRE,
        dateEmission: null,
        natureIdentite: TypePieceIdentite.CARTE_IDENTITE,
        fichier: fichier(),
        maintenant: AUJOURD_HUI,
      }),
    ).toThrow(VersoDeLaPieceIncoherentError);

    // Un KBIS n'a pas de dos : lui en attacher un désignerait des octets que
    // rien ne réclamerait jamais.
    expect(() =>
      dossier.deposer({
        type: TypePieceJustificative.KBIS,
        beneficiaireId: null,
        dateEmission: null,
        fichier: fichier(),
        verso: fichier(),
        maintenant: AUJOURD_HUI,
      }),
    ).toThrow(VersoDeLaPieceIncoherentError);
  });

  it('n’exige le verso que de la carte nationale d’identité', () => {
    // C'est la **nature** qui décide, pas le type : seule la carte porte au dos
    // sa date d'expiration. Les trois autres se prouvent d'une seule page.
    const dossier = DossierDePieces.vierge(SOCIETE);
    const depot = (natureIdentite: TypePieceIdentite, avecVerso: boolean) =>
      dossier.deposer({
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: BENEFICIAIRE,
        dateEmission: null,
        natureIdentite,
        fichier: fichier(),
        verso: avecVerso ? fichier() : null,
        maintenant: AUJOURD_HUI,
      });

    for (const nature of [
      TypePieceIdentite.PASSEPORT,
      TypePieceIdentite.PERMIS_CONDUIRE,
      TypePieceIdentite.TITRE_SEJOUR,
    ]) {
      expect(depot(nature, false).verso).toBeNull();
      expect(() => depot(nature, true)).toThrow(VersoDeLaPieceIncoherentError);
    }

    // La carte, à l'inverse : le dos fait partie de la preuve.
    const carte = TypePieceIdentite.CARTE_IDENTITE;
    expect(() => depot(carte, false)).toThrow(VersoDeLaPieceIncoherentError);
    expect(depot(carte, true).verso).not.toBeNull();
  });

  it('exige la nature d’une pièce d’identité, et l’interdit ailleurs', () => {
    // « Pièce d'identité » ne désigne pas un document mais une famille de
    // quatre : sans savoir lequel, le dossier ne peut pas dire s'il lui manque
    // un verso.
    const dossier = DossierDePieces.vierge(SOCIETE);

    expect(() =>
      dossier.deposer({
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: BENEFICIAIRE,
        dateEmission: null,
        fichier: fichier(),
        verso: fichier(),
        maintenant: AUJOURD_HUI,
      }),
    ).toThrow(NatureDeLaPieceIdentiteIncoherenteError);

    // Un KBIS n'a qu'une façon d'être un extrait d'immatriculation.
    expect(() =>
      dossier.deposer({
        type: TypePieceJustificative.KBIS,
        beneficiaireId: null,
        dateEmission: null,
        natureIdentite: TypePieceIdentite.PASSEPORT,
        fichier: fichier(),
        maintenant: AUJOURD_HUI,
      }),
    ).toThrow(NatureDeLaPieceIdentiteIncoherenteError);
  });

  it('remplace le verso avec le recto, jamais séparément', () => {
    // Garder l'ancien dos accolerait le verso de la pièce périmée au recto de
    // la nouvelle : l'instruction porterait sur un document qui n'existe pas.
    const dossier = DossierDePieces.vierge(SOCIETE);
    const premier = fichier();
    dossier.deposer({
      type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
      beneficiaireId: BENEFICIAIRE,
      dateEmission: null,
      natureIdentite: TypePieceIdentite.CARTE_IDENTITE,
      fichier: fichier(),
      verso: premier,
      maintenant: AUJOURD_HUI,
    });

    const second = FichierDepose.depose({
      nomOrigine: 'cni-verso-2.jpg',
      cleStockage: 'conformite/societes/societe-1/cni-verso-2',
      url: 'https://exemple/cni-verso-2.jpg',
      mimeType: 'image/jpeg',
      tailleOctets: 8_000,
    });
    const piece = dossier.deposer({
      type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
      beneficiaireId: BENEFICIAIRE,
      dateEmission: null,
      natureIdentite: TypePieceIdentite.CARTE_IDENTITE,
      fichier: fichier(),
      verso: second,
      maintenant: AUJOURD_HUI,
    });

    expect(dossier.pieces).toHaveLength(1);
    expect(piece.verso?.cleStockage).toBe(second.cleStockage);
  });
});

describe('DossierDePieces — la complétude', () => {
  it('réclame les trois pièces de la société tant que rien n’est déposé', () => {
    // Trois, et non quatre : le DBE-S1 en est sorti, il se compte par
    // bénéficiaire. Une société sans bénéficiaire déclaré ne doit donc rien
    // devoir de nominatif.
    const dossier = DossierDePieces.vierge(SOCIETE);

    const manquantes = dossier.piecesManquantes([], AUJOURD_HUI);

    expect(manquantes.map((m) => m.type)).toEqual([
      TypePieceJustificative.KBIS,
      TypePieceJustificative.STATUTS,
      TypePieceJustificative.LISTE_ACTIONNAIRES,
    ]);
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
    ]);

    const manquantes = dossier.piecesManquantes([], AUJOURD_HUI);

    expect(manquantes).toHaveLength(3);
    expect(manquantes.every((m) => m.raison === 'en_attente')).toBe(true);
  });

  it('tient le dossier pour complet quand les trois sont acceptées', () => {
    expect(dossierComplet().estComplet([], AUJOURD_HUI)).toBe(true);
  });

  it('exige un DBE-S1 et une pièce d’identité par bénéficiaire déclaré', () => {
    // Deux documents par personne, et non plus un seul formulaire pour toute
    // la société : leur nombre fait partie de la règle, et il vient du registre
    // par l'appelant.
    const dossier = dossierComplet();

    const manquantes = dossier.piecesManquantes(['b-1', 'b-2'], AUJOURD_HUI);

    expect(manquantes).toEqual([
      {
        type: TypePieceJustificative.DBE_S1,
        beneficiaireId: 'b-1',
        raison: 'absente',
      },
      {
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: 'b-1',
        raison: 'absente',
      },
      {
        type: TypePieceJustificative.DBE_S1,
        beneficiaireId: 'b-2',
        raison: 'absente',
      },
      {
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: 'b-2',
        raison: 'absente',
      },
    ]);
  });

  it('tient pour complet un dossier dont chaque bénéficiaire a ses deux pièces', () => {
    const dossier = dossierAvec([
      {
        type: TypePieceJustificative.KBIS,
        dateEmission: new Date('2026-08-01'),
      },
      { type: TypePieceJustificative.STATUTS },
      { type: TypePieceJustificative.LISTE_ACTIONNAIRES },
      { type: TypePieceJustificative.DBE_S1, beneficiaireId: BENEFICIAIRE },
      {
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: BENEFICIAIRE,
      },
    ]);
    for (const piece of dossier.pieces) {
      dossier.accepterLaPiece(piece.id, AUJOURD_HUI);
    }

    expect(dossier.estComplet([BENEFICIAIRE], AUJOURD_HUI)).toBe(true);
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
