import {
  SignableDocument,
  type SignableDocumentSnapshot,
} from './signable-document';
import { DocumentRelatedTo, DocumentType } from '../enums/document-type.enum';
import {
  CibleDeDocumentInvalideError,
  InvestissementCibleManquantError,
  ProjetCibleManquantError,
} from '../errors';

/*
 * Les six tests de « galerie de projet » ont disparu avec le type
 * `PHOTO_PROJET` : ils vérifiaient qu'une couverture doit être une photo, qu'un
 * rang ne se pose pas sur un KBIS, qu'une photo sans projet ne peut être ni
 * l'une ni l'autre — trois règles qui n'existaient que parce qu'un agrégat
 * servait à deux métiers. Ce qu'elles protégeaient est devenu sans objet, et ce
 * qu'elles ne protégeaient pas — l'unicité de la vignette, qu'aucun document ne
 * pouvait tenir — est désormais couvert dans `catalog`, sur `GalerieProjet`.
 *
 * Le dépôt de référence est maintenant un bulletin de souscription : le contexte
 * ne range plus que des pièces qui se signent.
 */
const depot = {
  type: DocumentType.PROSPECTUS,
  relatedTo: DocumentRelatedTo.PROJECT,
  userId: null,
  projectId: 'proj-1',
  investmentId: null,
  originalName: 'prospectus.pdf',
  filename: 'projets/prospectus-abc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 240_000,
  path: 'https://stockage.test/projets/prospectus-abc.pdf',
  isPublic: true,
  uploadedBy: 7,
};

const document = (etat: Partial<SignableDocumentSnapshot> = {}) =>
  new SignableDocument({
    ...depot,
    id: 'doc-1',
    createdAt: new Date('2026-08-15T10:00:00Z'),
    ...etat,
  });

describe('SignableDocument — dépôt', () => {
  it('accepte une pièce rattachée à un compte, sans autre cible', () => {
    const naissant = SignableDocument.televerser({
      ...depot,
      type: DocumentType.IDENTITE,
      relatedTo: DocumentRelatedTo.USER,
      userId: 7,
      projectId: null,
    });

    expect(naissant.relatedTo).toBe(DocumentRelatedTo.USER);
  });

  it('exige un projet pour une pièce de projet', () => {
    expect(() =>
      SignableDocument.televerser({ ...depot, projectId: null }),
    ).toThrow(ProjetCibleManquantError);
  });

  it('exige un investissement pour une pièce d’investissement', () => {
    expect(() =>
      SignableDocument.televerser({
        ...depot,
        type: DocumentType.BULLETIN_SOUSCRIPTION,
        relatedTo: DocumentRelatedTo.INVESTMENT,
        projectId: 'proj-1',
        investmentId: null,
      }),
    ).toThrow(InvestissementCibleManquantError);
  });

  it('refuse une cible qui n’existe pas', () => {
    expect(() =>
      SignableDocument.televerser({
        ...depot,
        relatedTo: 'SPV' as DocumentRelatedTo,
      }),
    ).toThrow(CibleDeDocumentInvalideError);
  });
});

describe('SignableDocument — interrogations', () => {
  it('dit si la pièce est consultable sans authentification', () => {
    expect(document({ isPublic: true }).estPublic).toBe(true);
    expect(document({ isPublic: false }).estPublic).toBe(false);
  });

  it('rend un état sérialisable, sans champ privé', () => {
    const etat = document().snapshot();

    expect(Object.keys(etat)).toEqual(
      expect.arrayContaining(['id', 'type', 'isPublic']),
    );
    expect(JSON.parse(JSON.stringify(etat)).isPublic).toBe(true);
  });

  it('ne porte plus ni rang d’affichage ni couverture', () => {
    const etat = document().snapshot();

    expect(etat).not.toHaveProperty('ordre');
    expect(etat).not.toHaveProperty('estPrincipale');
  });
});
