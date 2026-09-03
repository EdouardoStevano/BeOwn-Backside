import { GalerieProjet } from './galerie-projet.vo';
import type { PhotoProjetSnapshot } from '../entities/photo-projet';
import {
  ImageDeProjetInvalideError,
  PhotoDeProjetIntrouvableError,
  PositionDePhotoInvalideError,
} from '../errors/contenu-projet.errors';

const depot = (nom: string) => ({
  url: `https://cdn.test/projets/${nom}.jpg`,
  cleStockage: `beown/projets/${nom}`,
  nomOriginal: `${nom}.jpg`,
  mimeType: 'image/jpeg',
  tailleOctets: 240_000,
  deposeePar: 7,
});

/** Trois photos, déposées dans cet ordre — la première est donc la vignette. */
const troisPhotos = () =>
  GalerieProjet.vide()
    .ajoutant(depot('facade'))
    .ajoutant(depot('sejour'))
    .ajoutant(depot('jardin'));

const noms = (galerie: GalerieProjet) =>
  galerie.toSnapshot().map((p) => p.nomOriginal.replace('.jpg', ''));
const vignettes = (galerie: GalerieProjet) =>
  galerie.toSnapshot().filter((p) => p.estPrincipale);
/** L'identifiant est tiré à la volée : on retrouve une photo par son nom. */
const idDe = (galerie: GalerieProjet, nom: string) =>
  galerie.toSnapshot().find((p) => p.nomOriginal === `${nom}.jpg`)!.id;

describe('GalerieProjet — dépôt', () => {
  it('promeut la première photo en vignette', () => {
    const galerie = GalerieProjet.vide().ajoutant(depot('facade'));

    expect(galerie.couverture?.cleStockage).toBe('beown/projets/facade');
  });

  it('ne décoiffe pas la vignette quand une photo s’ajoute', () => {
    expect(troisPhotos().couverture?.cleStockage).toBe('beown/projets/facade');
  });

  it('refuse ce qui n’est pas une image', () => {
    expect(() =>
      GalerieProjet.vide().ajoutant({
        ...depot('prospectus'),
        mimeType: 'application/pdf',
      }),
    ).toThrow(ImageDeProjetInvalideError);
  });

  it('n’a pas de vignette tant qu’elle est vide', () => {
    expect(GalerieProjet.vide().couverture).toBeNull();
  });
});

describe('GalerieProjet — vignette unique', () => {
  it('n’en compte jamais plus d’une', () => {
    expect(vignettes(troisPhotos())).toHaveLength(1);
  });

  it('décoiffe l’ancienne en désignant la nouvelle', () => {
    const galerie = troisPhotos();

    const apres = galerie.designantCouverture(idDe(galerie, 'jardin'));

    expect(vignettes(apres)).toHaveLength(1);
    expect(apres.couverture?.cleStockage).toBe('beown/projets/jardin');
  });

  it('met la vignette désignée en tête, en décalant les autres', () => {
    const galerie = troisPhotos();

    expect(noms(galerie.designantCouverture(idDe(galerie, 'jardin')))).toEqual([
      'jardin',
      'facade',
      'sejour',
    ]);
  });

  /*
   * Le cœur du dessin : la vignette n'est pas un drapeau qu'il faudrait garder
   * unique, c'est le rang 0. Déplacer une photo en tête suffit donc à la
   * désigner, et il n'existe aucun chemin par lequel deux photos pourraient
   * l'être.
   */
  it('fait de toute photo déplacée en tête la nouvelle vignette', () => {
    const galerie = troisPhotos();

    const apres = galerie.deplacant(idDe(galerie, 'sejour'), 0);

    expect(apres.couverture?.cleStockage).toBe('beown/projets/sejour');
    expect(vignettes(apres)).toHaveLength(1);
  });

  it('promeut la suivante quand la vignette est retirée', () => {
    const galerie = troisPhotos();
    const facade = galerie.toSnapshot()[0];

    const { galerie: apres } = galerie.sans(facade.id);

    expect(vignettes(apres)).toHaveLength(1);
    expect(apres.couverture?.cleStockage).toBe('beown/projets/sejour');
  });

  it('ne promeut rien quand la dernière photo est retirée', () => {
    const galerie = GalerieProjet.vide().ajoutant(depot('facade'));
    const seule = galerie.toSnapshot()[0];

    const { galerie: apres } = galerie.sans(seule.id);

    expect(apres.nombre).toBe(0);
    expect(apres.couverture).toBeNull();
  });

  it('garde la vignette quand une autre photo est retirée', () => {
    const galerie = troisPhotos();

    const { galerie: apres } = galerie.sans(idDe(galerie, 'sejour'));

    expect(apres.couverture?.cleStockage).toBe('beown/projets/facade');
  });
});

describe('GalerieProjet — retrait', () => {
  it('rend la clé de stockage libérée', () => {
    const galerie = troisPhotos();

    expect(galerie.sans(idDe(galerie, 'sejour')).cleLiberee).toBe(
      'beown/projets/sejour',
    );
  });

  it('signale une photo absente', () => {
    expect(() => troisPhotos().sans('inconnue')).toThrow(
      PhotoDeProjetIntrouvableError,
    );
  });
});

describe('GalerieProjet — ordre', () => {
  it('déplace une photo sans toucher à la vignette quand le rang 0 ne bouge pas', () => {
    const galerie = troisPhotos();

    const apres = galerie.deplacant(idDe(galerie, 'jardin'), 1);

    expect(apres.couverture?.cleStockage).toBe('beown/projets/facade');
    expect(noms(apres)).toEqual(['facade', 'jardin', 'sejour']);
  });

  it('refuse un rang hors de la galerie', () => {
    const galerie = troisPhotos();

    expect(() => galerie.deplacant(galerie.toSnapshot()[0].id, 3)).toThrow(
      PositionDePhotoInvalideError,
    );
  });
});

describe('GalerieProjet — texte alternatif', () => {
  it('le pose et l’efface', () => {
    const galerie = troisPhotos();
    const facade = galerie.toSnapshot()[0];

    const decrite = galerie.decrivant(facade.id, '  Façade sur rue  ');
    expect(decrite.toSnapshot()[0].texteAlternatif).toBe('Façade sur rue');

    expect(
      decrite.decrivant(facade.id, null).toSnapshot()[0].texteAlternatif,
    ).toBeNull();
  });

  it('traite une chaîne blanche comme une absence', () => {
    const galerie = troisPhotos();
    const facade = galerie.toSnapshot()[0];

    expect(
      galerie.decrivant(facade.id, '   ').toSnapshot()[0].texteAlternatif,
    ).toBeNull();
  });
});

describe('GalerieProjet — reconstitution', () => {
  const ligne = (
    id: string,
    etat: Partial<PhotoProjetSnapshot> = {},
  ): PhotoProjetSnapshot => ({
    id,
    url: `https://cdn.test/${id}.jpg`,
    cleStockage: `beown/projets/${id}`,
    nomOriginal: `${id}.jpg`,
    mimeType: 'image/jpeg',
    tailleOctets: 1000,
    texteAlternatif: null,
    estPrincipale: false,
    position: 0,
    deposeePar: 7,
    deposeeLe: new Date('2026-01-01T00:00:00Z'),
    ...etat,
  });

  it('tolère une colonne vide', () => {
    expect(GalerieProjet.restore(null).nombre).toBe(0);
    expect(GalerieProjet.restore(undefined).nombre).toBe(0);
  });

  /*
   * Les deux cas que la table `document` laissait passer, et que la reprise de
   * données doit donc normaliser plutôt que relire telle quelle.
   */
  it('n’en garde qu’une quand plusieurs lignes se disent vignette', () => {
    const galerie = GalerieProjet.restore([
      ligne('a', { position: 0, estPrincipale: true }),
      ligne('b', { position: 1, estPrincipale: true }),
    ]);

    expect(vignettes(galerie)).toHaveLength(1);
    expect(galerie.couverture?.id).toBe('a');
  });

  it('en promeut une quand aucune ligne ne se dit vignette', () => {
    const galerie = GalerieProjet.restore([
      ligne('a', { position: 0 }),
      ligne('b', { position: 1 }),
    ]);

    expect(galerie.couverture?.id).toBe('a');
  });

  /*
   * Le cas que produit la reprise de données : la ligne `document` qui portait
   * `estPrincipale` n'était pas nécessairement celle d'`ordre` 0.
   */
  it('ramène au rang 0 la vignette marquée plus loin dans la galerie', () => {
    const galerie = GalerieProjet.restore([
      ligne('a', { position: 0 }),
      ligne('b', { position: 1 }),
      ligne('c', { position: 2, estPrincipale: true }),
    ]);

    expect(galerie.toSnapshot().map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(galerie.couverture?.id).toBe('c');
    expect(vignettes(galerie)).toHaveLength(1);
  });

  it('renumérote des positions stockées incohérentes', () => {
    const galerie = GalerieProjet.restore([
      ligne('a', { position: 7 }),
      ligne('b', { position: 9 }),
    ]);

    expect(galerie.toSnapshot().map((p) => p.position)).toEqual([0, 1]);
  });

  it('relit dans l’ordre des positions stockées', () => {
    const galerie = GalerieProjet.restore([
      ligne('b', { position: 1 }),
      ligne('a', { position: 0, estPrincipale: true }),
    ]);

    expect(galerie.toSnapshot().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('accepte un format que le dépôt refuserait aujourd’hui', () => {
    const galerie = GalerieProjet.restore([
      ligne('vieux', { mimeType: 'image/gif' }),
    ]);

    expect(galerie.nombre).toBe(1);
  });
});
