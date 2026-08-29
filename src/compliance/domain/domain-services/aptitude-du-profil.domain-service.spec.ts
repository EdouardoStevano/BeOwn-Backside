import { DossierDePieces } from '../aggregates/dossier-de-pieces';
import { PieceJustificative } from '../entities/piece-justificative';
import {
  exigeUnVerso,
  PIECES_EXIGEES_DE_LA_SOCIETE,
  PIECES_EXIGEES_DU_BENEFICIAIRE,
  TypePieceJustificative,
} from '../enums/type-piece-justificative.enum';
import { DecisionPiece } from '../value-objects/decision-piece.vo';
import { TypePieceIdentite } from '../enums/type-piece-identite.enum';
import { StatutKyb } from '../enums/statut-kyb.enum';
import { FichierDepose } from '../value-objects/fichier-depose.vo';
import {
  aptitudeDeLaPersonnePhysique,
  aptitudeDeLaSociete,
} from './aptitude-du-profil.domain-service';

const LE_JOUR = new Date('2026-08-28T10:00:00.000Z');
const BENEFICIAIRE = 'beneficiaire-1';

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
    nomOrigine: 'piece.pdf',
    cleStockage: 'conformite/societes/s-1/piece',
    url: 'https://exemple/piece.pdf',
    mimeType: 'application/pdf',
    tailleOctets: 4_000,
  });

/**
 * Un dossier dont toutes les pièces exigées sont déposées et acceptées.
 *
 * Deux familles : trois documents pour l'entreprise, deux **par personne** qui
 * la contrôle — le DBE-S1 et la pièce d'identité sont nominatifs.
 */
function dossierComplet(beneficiaires: string[]): DossierDePieces {
  const attendues = [
    ...PIECES_EXIGEES_DE_LA_SOCIETE.map((type) => ({
      type,
      beneficiaireId: null as string | null,
    })),
    ...beneficiaires.flatMap((beneficiaireId) =>
      PIECES_EXIGEES_DU_BENEFICIAIRE.map((type) => ({
        type,
        beneficiaireId: beneficiaireId as string | null,
      })),
    ),
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
            natureIdentite: natureDe(attendue.type),
            // Le KBIS est le seul daté : émis de la veille, il est frais.
            dateEmission:
              attendue.type === TypePieceJustificative.KBIS
                ? new Date('2026-08-27')
                : null,
            deposeeLe: LE_JOUR,
          },
          fichier: fichier(),
          verso: exigeUnVerso(attendue.type, natureDe(attendue.type))
            ? fichier()
            : null,
          decision: DecisionPiece.enAttente(),
        }),
    ),
  });

  for (const piece of dossier.pieces) {
    dossier.accepterLaPiece(piece.id, LE_JOUR);
  }
  return dossier;
}

/** Une société dont le représentant est vérifié et le KYB validé. */
const societeIrreprochable = () => ({
  kycDuRepresentantValide: true,
  kybValide: true,
  statutKyb: StatutKyb.VALIDE,
  societeImmatriculee: true,
  dossier: dossierComplet([BENEFICIAIRE]),
  beneficiaires: [BENEFICIAIRE],
  maintenant: LE_JOUR,
});

/**
 * La même société, dont l'équipe conformité n'a encore rien tranché.
 *
 * C'est l'état de toutes les sociétés au lendemain de la bascule : le verdict
 * n'était stocké nulle part, et aucune trace ne permettait de valider
 * rétroactivement en nommant un décideur.
 */
const societeNonInstruite = () => ({
  ...societeIrreprochable(),
  kybValide: false,
  statutKyb: StatutKyb.EN_CONSTITUTION,
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
  describe('le verdict', () => {
    it('rend apte la société dont le KYC du représentant et le KYB sont valides', () => {
      expect(aptitudeDeLaSociete(societeIrreprochable())).toEqual({
        peutOperer: true,
        motifs: [],
      });
    });

    it('exige le KYC du représentant, même quand le KYB est validé', () => {
      // Une personne morale ne signe pas : c'est une personne physique qui
      // signe pour elle.
      const aptitude = aptitudeDeLaSociete({
        ...societeIrreprochable(),
        kycDuRepresentantValide: false,
      });

      expect(aptitude.peutOperer).toBe(false);
      expect(aptitude.motifs.map((m) => m.code)).toContain('KYC_INCOMPLET');
    });

    it("refuse une société dont l'instruction n'a pas abouti", () => {
      const aptitude = aptitudeDeLaSociete(societeNonInstruite());

      expect(aptitude.peutOperer).toBe(false);
      expect(aptitude.motifs.map((m) => m.code)).toEqual([
        'KYB_EN_INSTRUCTION',
      ]);
    });

    it('ne reproche rien à une société apte, même si une pièce a bougé depuis', () => {
      // Le contrat d'`EligibiliteDuTitulaire` dit « vide sinon », et le service
      // ne décide plus de la complétude : c'est l'instruction qui a tranché.
      // Un second bénéficiaire déclaré après coup remettra le dossier en
      // constitution par un événement — pas en contredisant le verdict ici.
      const aptitude = aptitudeDeLaSociete({
        ...societeIrreprochable(),
        beneficiaires: [BENEFICIAIRE, 'beneficiaire-2'],
      });

      expect(aptitude).toEqual({ peutOperer: true, motifs: [] });
    });
  });

  describe('ce qu’il reste à réunir', () => {
    it('exige que la société soit immatriculée', () => {
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        societeImmatriculee: false,
      });

      expect(aptitude.motifs.map((m) => m.code)).toContain(
        'SOCIETE_NON_IMMATRICULEE',
      );
    });

    it("signale l'absence de bénéficiaire à part des pièces", () => {
      // Sans bénéficiaire déclaré, le dossier ne réclame aucune pièce
      // d'identité et passerait pour complet à tort — d'où un motif qui lui est
      // propre, pour que l'écran envoie au bon formulaire.
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        dossier: dossierComplet([]),
        beneficiaires: [],
      });

      expect(aptitude.peutOperer).toBe(false);
      expect(aptitude.motifs.map((m) => m.code)).toEqual([
        'BENEFICIAIRES_NON_DECLARES',
      ]);
    });

    it('réclame la pièce d’identité de chaque bénéficiaire déclaré', () => {
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        beneficiaires: [BENEFICIAIRE, 'beneficiaire-2'],
      });

      expect(aptitude.motifs.map((m) => m.code)).toEqual(['PIECES_MANQUANTES']);
    });

    it('réclame un KBIS qui a vieilli', () => {
      // Un extrait déposé en août ne prouve plus rien six mois après : le
      // titulaire doit savoir qu'il a un document à rafraîchir.
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        maintenant: new Date('2027-02-28T10:00:00.000Z'),
      });

      expect(aptitude.motifs.map((m) => m.code)).toEqual(['PIECES_MANQUANTES']);
    });

    it('tait l’instruction tant qu’il reste quelque chose à déposer', () => {
      // « En cours d'instruction » dit à quelqu'un qui n'a pas encore déposé
      // son KBIS d'attendre, alors qu'on attend quelque chose de lui.
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        dossier: DossierDePieces.vierge('s-1'),
      });

      expect(aptitude.motifs.map((m) => m.code)).not.toContain(
        'KYB_EN_INSTRUCTION',
      );
    });

    it('cumule les motifs plutôt que de rendre le premier', () => {
      // Le titulaire doit voir tout ce qu'il lui reste à faire, pas le
      // découvrir un obstacle après l'autre.
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        kycDuRepresentantValide: false,
        societeImmatriculee: false,
        dossier: DossierDePieces.vierge('s-1'),
        beneficiaires: [],
      });

      expect(aptitude.motifs.map((m) => m.code)).toEqual([
        'KYC_INCOMPLET',
        'SOCIETE_NON_IMMATRICULEE',
        'BENEFICIAIRES_NON_DECLARES',
        'PIECES_MANQUANTES',
      ]);
    });
  });

  describe('l’état du dossier KYB', () => {
    it('dit toujours un refus, même quand des pièces manquent aussi', () => {
      // C'est l'information que le titulaire doit voir en premier, et elle ne
      // se déduit d'aucune autre : un dossier rejeté n'a pas l'air différent
      // d'un dossier en attente.
      const aptitude = aptitudeDeLaSociete({
        ...societeNonInstruite(),
        statutKyb: StatutKyb.REFUSE,
        beneficiaires: [BENEFICIAIRE, 'beneficiaire-2'],
      });

      expect(aptitude.motifs.map((m) => m.code)).toEqual([
        'PIECES_MANQUANTES',
        'KYB_REFUSE',
      ]);
    });

    it('distingue une validité échue d’une instruction en cours', () => {
      // Redéposer et attendre ne sont pas le même geste : un code unique aurait
      // laissé l'écran les confondre.
      const aptitude = aptitudeDeLaSociete({
        ...societeIrreprochable(),
        kybValide: false,
        statutKyb: StatutKyb.VALIDE,
      });

      expect(aptitude.motifs.map((m) => m.code)).toEqual(['KYB_EXPIRE']);
    });
  });
});
