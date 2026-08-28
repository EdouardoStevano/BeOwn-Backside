import { PieceJustificativeSnapshot } from 'src/compliance/domain/entities/piece-justificative';
import { TypePieceJustificative } from 'src/compliance/domain/enums/type-piece-justificative.enum';
import { StatutPiece } from 'src/compliance/domain/value-objects/decision-piece.vo';
import { vuePiece } from './dossier-de-pieces-vue.mapper';

const DEPOSEE_LE = new Date('2026-08-28T08:31:53.912Z');
const DECIDEE_LE = new Date('2026-08-28T08:58:34.807Z');

/** La forme de la table : dix-huit clés à plat, dont cinq pour un dos absent. */
function snapshot(
  ecart: Partial<PieceJustificativeSnapshot> = {},
): PieceJustificativeSnapshot {
  return {
    id: 'piece-1',
    type: TypePieceJustificative.KBIS,
    beneficiaireId: null,
    dateEmission: null,
    deposeeLe: DEPOSEE_LE,
    nomOrigine: 'Annexe 1 KBIS SAS.pdf',
    cleStockage: 'beown/conformite/societes/s-1/xcc25f5',
    url: 'https://exemple/xcc25f5',
    mimeType: 'application/pdf',
    tailleOctets: 25_409,
    versoNomOrigine: null,
    versoCleStockage: null,
    versoUrl: null,
    versoMimeType: null,
    versoTailleOctets: null,
    statut: StatutPiece.ACCEPTEE,
    motifRefus: null,
    decideeLe: DECIDEE_LE,
    ...ecart,
  };
}

describe('vuePiece', () => {
  it('publie un KBIS sans aucune clé sans objet', () => {
    // Le cas qui motivait tout : cinq `verso*` nuls, un `beneficiaireId` nul,
    // un `dateEmission` nul et un `motifRefus` nul, pour une pièce qui n'a ni
    // dos, ni bénéficiaire, ni refus.
    expect(vuePiece(snapshot())).toEqual({
      id: 'piece-1',
      type: TypePieceJustificative.KBIS,
      libelle: 'extrait KBIS',
      deposeeLe: DEPOSEE_LE,
      fichier: {
        nomOrigine: 'Annexe 1 KBIS SAS.pdf',
        url: 'https://exemple/xcc25f5',
        mimeType: 'application/pdf',
        tailleOctets: 25_409,
      },
      instruction: {
        statut: StatutPiece.ACCEPTEE,
        decideeLe: DECIDEE_LE,
      },
    });
  });

  it('ne publie jamais la clé du magasin', () => {
    // Elle ne sert qu'au serveur pour relire les octets ; la publier dirait à
    // tout titulaire comment le stockage est rangé.
    const vue = vuePiece(snapshot());

    expect(JSON.stringify(vue)).not.toContain('cleStockage');
    expect(JSON.stringify(vue)).not.toContain('beown/conformite');
  });

  it('groupe le verso quand il existe, et l’omet sinon', () => {
    const avecDos = vuePiece(
      snapshot({
        type: TypePieceJustificative.PIECE_IDENTITE_BENEFICIAIRE,
        beneficiaireId: 'b-1',
        versoNomOrigine: 'cni-verso.jpg',
        versoCleStockage: 'beown/conformite/societes/s-1/verso',
        versoUrl: 'https://exemple/verso',
        versoMimeType: 'image/jpeg',
        versoTailleOctets: 8_000,
      }),
    );

    expect(avecDos.verso).toEqual({
      nomOrigine: 'cni-verso.jpg',
      url: 'https://exemple/verso',
      mimeType: 'image/jpeg',
      tailleOctets: 8_000,
    });
    expect(vuePiece(snapshot())).not.toHaveProperty('verso');
  });

  it('nomme le bénéficiaire que la pièce documente', () => {
    // Un identifiant seul n'aide pas le titulaire à savoir de quelle personne
    // il s'agit — même raison que sur les pièces manquantes.
    const vue = vuePiece(
      snapshot({
        type: TypePieceJustificative.DBE_S1,
        beneficiaireId: 'b-1',
      }),
      new Map([['b-1', 'Awa Diallo']]),
    );

    expect(vue.beneficiaireId).toBe('b-1');
    expect(vue.beneficiaire).toBe('Awa Diallo');
  });

  it('omet le nom d’un bénéficiaire que le registre ne connaît plus', () => {
    // Retirer une personne du registre ne supprime pas sa pièce d'identité :
    // elle se conserve cinq ans (RG-KYC-10). La vue ne doit pas inventer un nom.
    const vue = vuePiece(
      snapshot({
        type: TypePieceJustificative.DBE_S1,
        beneficiaireId: 'b-parti',
      }),
    );

    expect(vue.beneficiaireId).toBe('b-parti');
    expect(vue).not.toHaveProperty('beneficiaire');
  });

  it('publie le motif d’un refus, et rien sur une pièce en attente', () => {
    const refusee = vuePiece(
      snapshot({
        statut: StatutPiece.REFUSEE,
        motifRefus: 'Extrait illisible',
      }),
    );
    expect(refusee.instruction).toEqual({
      statut: StatutPiece.REFUSEE,
      motifRefus: 'Extrait illisible',
      decideeLe: DECIDEE_LE,
    });

    const enAttente = vuePiece(
      snapshot({ statut: StatutPiece.EN_ATTENTE, decideeLe: null }),
    );
    expect(enAttente.instruction).toEqual({ statut: StatutPiece.EN_ATTENTE });
  });

  it('publie la date d’émission des seules pièces qui en portent une', () => {
    const emiseLe = new Date('2026-08-01');

    expect(vuePiece(snapshot({ dateEmission: emiseLe })).dateEmission).toEqual(
      emiseLe,
    );
    expect(vuePiece(snapshot())).not.toHaveProperty('dateEmission');
  });
});
