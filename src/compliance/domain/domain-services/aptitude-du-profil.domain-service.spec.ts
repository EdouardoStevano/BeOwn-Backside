import { DossierDePieces } from '../aggregates/dossier-de-pieces';
import { PieceJustificative } from '../entities/piece-justificative';
import {
  PIECES_EXIGEES_DE_LA_SOCIETE,
  TypePieceJustificative,
} from '../enums/type-piece-justificative.enum';
import { DecisionPiece } from '../value-objects/decision-piece.vo';
import { FichierDepose } from '../value-objects/fichier-depose.vo';
import {
  aptitudeDeLaPersonnePhysique,
  aptitudeDeLaSociete,
} from './aptitude-du-profil.domain-service';

const LE_JOUR = new Date('2026-08-28T10:00:00.000Z');
const BENEFICIAIRE = 'beneficiaire-1';

const fichier = () =>
  FichierDepose.depose({
    nomOrigine: 'piece.pdf',
    cleStockage: 'conformite/societes/s-1/piece',
    url: 'https://exemple/piece.pdf',
    mimeType: 'application/pdf',
    tailleOctets: 4_000,
  });

/** Un dossier dont toutes les pièces exigées sont déposées et acceptées. */
function dossierComplet(beneficiaires: string[]): DossierDePieces {
  const attendues = [
    ...PIECES_EXIGEES_DE_LA_SOCIETE.map((type) => ({
      type,
      beneficiaireId: null as string | null,
    })),
    ...beneficiaires.map((beneficiaireId) => ({
      type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
      beneficiaireId,
    })),
  ];

  const dossier = new DossierDePieces({
    societeId: 's-1',
    pieces: attendues.map(
      (attendue, rang) =>
        new PieceJustificative({
          entete: {
            id: `piece-${rang + 1}`,
            type: attendue.type,
            beneficiaireId: attendue.beneficiaireId,
            // Le KBIS est le seul daté : émis de la veille, il est frais.
            dateEmission:
              attendue.type === TypePieceJustificative.KBIS
                ? new Date('2026-08-27')
                : null,
            deposeeLe: LE_JOUR,
          },
          fichier: fichier(),
          decision: DecisionPiece.enAttente(),
        }),
    ),
  });

  for (const piece of dossier.pieces) {
    dossier.accepterLaPiece(piece.id, LE_JOUR);
  }
  return dossier;
}

const societeIrreprochable = () => ({
  kycDuRepresentantValide: true,
  societeImmatriculee: true,
  dossier: dossierComplet([BENEFICIAIRE]),
  beneficiaires: [BENEFICIAIRE],
  maintenant: LE_JOUR,
});

describe('aptitudeDeLaPersonnePhysique', () => {
  it('rend apte le titulaire dont le KYC est validé', () => {
    expect(aptitudeDeLaPersonnePhysique(true)).toEqual({
      peutOperer: true,
      motifs: [],
    });
  });

  it('nomme le KYC quand il manque', () => {
    // « Votre profil n'est pas prêt » n'aide personne : le motif dit quoi faire.
    const aptitude = aptitudeDeLaPersonnePhysique(false);

    expect(aptitude.peutOperer).toBe(false);
    expect(aptitude.motifs.map((m) => m.code)).toEqual(['KYC_INCOMPLET']);
  });
});

describe('aptitudeDeLaSociete', () => {
  it('rend apte la société dont tout est réuni', () => {
    expect(aptitudeDeLaSociete(societeIrreprochable())).toEqual({
      peutOperer: true,
      motifs: [],
    });
  });

  it("exige le KYC du représentant, même quand la société est irréprochable", () => {
    // Une personne morale ne signe pas : c'est une personne physique qui signe
    // pour elle.
    const aptitude = aptitudeDeLaSociete({
      ...societeIrreprochable(),
      kycDuRepresentantValide: false,
    });

    expect(aptitude.peutOperer).toBe(false);
    expect(aptitude.motifs.map((m) => m.code)).toContain('KYC_INCOMPLET');
  });

  it('exige que la société soit immatriculée', () => {
    const aptitude = aptitudeDeLaSociete({
      ...societeIrreprochable(),
      societeImmatriculee: false,
    });

    expect(aptitude.motifs.map((m) => m.code)).toContain(
      'SOCIETE_NON_IMMATRICULEE',
    );
  });

  it("signale l'absence de bénéficiaire à part des pièces", () => {
    // Sans bénéficiaire déclaré, le dossier ne réclame aucune pièce d'identité
    // et passerait pour complet à tort — d'où un motif qui lui est propre, pour
    // que l'écran envoie au bon formulaire.
    const aptitude = aptitudeDeLaSociete({
      kycDuRepresentantValide: true,
      societeImmatriculee: true,
      dossier: dossierComplet([]),
      beneficiaires: [],
      maintenant: LE_JOUR,
    });

    expect(aptitude.peutOperer).toBe(false);
    expect(aptitude.motifs.map((m) => m.code)).toEqual([
      'BENEFICIAIRES_NON_DECLARES',
    ]);
  });

  it('réclame la pièce d’identité de chaque bénéficiaire déclaré', () => {
    // Le dossier de la société est complet, mais un second bénéficiaire vient
    // d'être déclaré : sa pièce manque.
    const aptitude = aptitudeDeLaSociete({
      ...societeIrreprochable(),
      beneficiaires: [BENEFICIAIRE, 'beneficiaire-2'],
    });

    expect(aptitude.peutOperer).toBe(false);
    expect(aptitude.motifs.map((m) => m.code)).toEqual(['PIECES_MANQUANTES']);
  });

  it('rend la société inapte quand son KBIS a vieilli', () => {
    // Un extrait accepté en août ne prouve plus rien six mois après : sans
    // cela, une société serait définitivement apte au premier passage.
    const aptitude = aptitudeDeLaSociete({
      ...societeIrreprochable(),
      maintenant: new Date('2027-02-28T10:00:00.000Z'),
    });

    expect(aptitude.peutOperer).toBe(false);
    expect(aptitude.motifs.map((m) => m.code)).toEqual(['PIECES_MANQUANTES']);
  });

  it('cumule les motifs plutôt que de rendre le premier', () => {
    // Le titulaire doit voir tout ce qu'il lui reste à faire, pas le découvrir
    // un obstacle après l'autre.
    const aptitude = aptitudeDeLaSociete({
      kycDuRepresentantValide: false,
      societeImmatriculee: false,
      dossier: DossierDePieces.vierge('s-1'),
      beneficiaires: [],
      maintenant: LE_JOUR,
    });

    expect(aptitude.motifs.map((m) => m.code)).toEqual([
      'KYC_INCOMPLET',
      'SOCIETE_NON_IMMATRICULEE',
      'BENEFICIAIRES_NON_DECLARES',
      'PIECES_MANQUANTES',
    ]);
  });
});
