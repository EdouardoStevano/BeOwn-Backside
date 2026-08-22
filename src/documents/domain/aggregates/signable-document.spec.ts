import {
  SignableDocument,
  type SignableDocumentSnapshot,
} from './signable-document';
import { DocumentRelatedTo, DocumentType } from '../enums/document-type.enum';
import {
  CibleDeDocumentInvalideError,
  DocumentSansProjetError,
  InvestissementCibleManquantError,
  ProjetCibleManquantError,
  SeulesLesPhotosOntUnOrdreError,
  SeulesLesPhotosSontPrincipalesError,
} from '../errors';

const depot = {
  type: DocumentType.PHOTO_PROJET,
  relatedTo: DocumentRelatedTo.PROJECT,
  userId: null,
  projectId: 'proj-1',
  investmentId: null,
  originalName: 'facade.jpg',
  filename: 'projets/facade-abc.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 240_000,
  path: 'https://stockage.test/projets/facade-abc.jpg',
  isPublic: true,
  uploadedBy: 7,
  ordre: null,
  estPrincipale: false,
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

describe('SignableDocument — galerie de projet', () => {
  it('accepte une photo de projet comme couverture', () => {
    const doc = document();

    doc.definirCommeImagePrincipale();

    expect(doc.estPrincipale).toBe(true);
  });

  it('refuse la couverture à ce qui n’est pas une photo de projet', () => {
    const doc = document({ type: DocumentType.KBIS });

    expect(() => doc.definirCommeImagePrincipale()).toThrow(
      SeulesLesPhotosSontPrincipalesError,
    );
  });

  it('refuse la couverture à une photo qui n’est rattachée à aucun projet', () => {
    const doc = document({ projectId: null });

    expect(() => doc.definirCommeImagePrincipale()).toThrow(
      DocumentSansProjetError,
    );
  });

  it('place une photo de projet à un rang donné', () => {
    const doc = document();

    doc.placerEnPosition(3);

    expect(doc.ordre).toBe(3);
  });

  it('refuse un rang à ce qui n’est pas une photo de projet', () => {
    const doc = document({ type: DocumentType.PROSPECTUS });

    expect(() => doc.placerEnPosition(1)).toThrow(
      SeulesLesPhotosOntUnOrdreError,
    );
  });

  it('ne change rien quand elle refuse', () => {
    const doc = document({ type: DocumentType.KBIS, ordre: 5 });

    expect(() => doc.placerEnPosition(1)).toThrow();
    expect(() => doc.definirCommeImagePrincipale()).toThrow();

    expect(doc.ordre).toBe(5);
    expect(doc.estPrincipale).toBe(false);
  });
});

describe('SignableDocument — interrogations', () => {
  it('dit si la pièce est consultable sans authentification', () => {
    expect(document({ isPublic: true }).estPublic).toBe(true);
    expect(document({ isPublic: false }).estPublic).toBe(false);
  });

  it('reconnaît une photo de la galerie d’un projet', () => {
    expect(document().estPhotoDeProjet).toBe(true);
    expect(document({ projectId: null }).estPhotoDeProjet).toBe(false);
    expect(document({ type: DocumentType.KBIS }).estPhotoDeProjet).toBe(false);
  });

  it('rend un état sérialisable, sans champ privé', () => {
    const etat = document().snapshot();

    expect(Object.keys(etat)).toEqual(
      expect.arrayContaining([
        'id',
        'type',
        'isPublic',
        'ordre',
        'estPrincipale',
      ]),
    );
    expect(JSON.parse(JSON.stringify(etat)).isPublic).toBe(true);
  });
});
