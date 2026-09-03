import { ProjectFactory } from '../factories/project.factory';
import { ProjectInstrument, ProjectType } from '../enums/project-status.enum';
import {
  BlocDeContenuIntrouvableError,
  PhotoDeProjetIntrouvableError,
  TitreDeBlocRequisError,
} from '../errors/contenu-projet.errors';
import { Project } from './project';

/*
 * Ce que les tests de `BlocsDeContenu` et `GalerieProjet` ne couvrent pas : que
 * l'agrégat **branche** bien ses neuf gestes sur les suites, qu'il les publie
 * dans son snapshot, et qu'un geste refusé ne laisse rien derrière lui.
 */

const projet = (): Project =>
  ProjectFactory.creer({
    titre: 'Résidence Horizon',
    type: ProjectType.RESIDENTIEL,
    capitalCible: 500_000,
    capitalMinimum: 300_000,
    dureeMois: 24,
    instrument: ProjectInstrument.OBLIGATION,
  });

const bloc = (titre: string) => ({ titre, corps: `<p>${titre}</p>` });

const photo = (nom: string) => ({
  url: `https://cdn.test/${nom}.jpg`,
  cleStockage: `beown/projets/${nom}`,
  nomOriginal: `${nom}.jpg`,
  mimeType: 'image/jpeg',
  tailleOctets: 240_000,
  deposeePar: 7,
});

describe('Project — contenu éditorial à la naissance', () => {
  it('naît sans blocs, sans photos et sans accroche', () => {
    const p = projet();

    expect(p.blocsDeContenu).toEqual([]);
    expect(p.photos).toEqual([]);
    expect(p.descriptionCourte).toBeNull();
    expect(p.photoPrincipale).toBeNull();
  });

  it('accepte une accroche à la création, en la rognant', () => {
    const p = ProjectFactory.creer({
      titre: 'Résidence Horizon',
      type: ProjectType.RESIDENTIEL,
      capitalCible: 500_000,
      capitalMinimum: 300_000,
      dureeMois: 24,
      instrument: ProjectInstrument.OBLIGATION,
      descriptionCourte: '  Douze logements neufs.  ',
    });

    expect(p.descriptionCourte).toBe('Douze logements neufs.');
  });
});

describe('Project — blocs de contenu', () => {
  it('ajoute autant de blocs que demandé, et les publie dans l’ordre', () => {
    const p = projet();

    p.ajouterBloc(bloc('Le quartier'));
    p.ajouterBloc(bloc('Le programme'));
    p.ajouterBloc(bloc('Le montage'));

    expect(p.blocsDeContenu.map((b) => b.titre)).toEqual([
      'Le quartier',
      'Le programme',
      'Le montage',
    ]);
    expect(p.blocsDeContenu.map((b) => b.position)).toEqual([0, 1, 2]);
  });

  it('réécrit, déplace et retire un bloc par son identifiant', () => {
    const p = projet();
    p.ajouterBloc(bloc('Le quartier'));
    p.ajouterBloc(bloc('Le montage'));
    const [quartier, montage] = p.blocsDeContenu.map((b) => b.id);

    p.modifierBloc(quartier, { titre: 'Le voisinage' });
    p.deplacerBloc(quartier, 1);

    expect(p.blocsDeContenu.map((b) => b.titre)).toEqual([
      'Le montage',
      'Le voisinage',
    ]);

    p.retirerBloc(montage);

    expect(p.blocsDeContenu.map((b) => b.titre)).toEqual(['Le voisinage']);
    expect(p.blocsDeContenu[0].position).toBe(0);
  });

  it('réordonne la fiche entière', () => {
    const p = projet();
    p.ajouterBloc(bloc('A'));
    p.ajouterBloc(bloc('B'));
    const [a, b] = p.blocsDeContenu.map((x) => x.id);

    p.reordonnerBlocs([b, a]);

    expect(p.blocsDeContenu.map((x) => x.titre)).toEqual(['B', 'A']);
  });

  it('ne laisse rien derrière un geste refusé', () => {
    const p = projet();
    p.ajouterBloc(bloc('Le quartier'));

    expect(() => p.ajouterBloc({ titre: '', corps: '<p>x</p>' })).toThrow(
      TitreDeBlocRequisError,
    );
    expect(() => p.retirerBloc('inconnu')).toThrow(
      BlocDeContenuIntrouvableError,
    );

    expect(p.blocsDeContenu.map((b) => b.titre)).toEqual(['Le quartier']);
  });

  it('ne se laisse pas réécrire par le tableau qu’il rend', () => {
    const p = projet();
    p.ajouterBloc(bloc('Le quartier'));

    p.blocsDeContenu.push({
      id: 'intrus',
      titre: 'Intrus',
      corps: '<p>x</p>',
      position: 1,
    });

    expect(p.blocsDeContenu).toHaveLength(1);
  });
});

describe('Project — galerie', () => {
  it('fait de la première photo la vignette', () => {
    const p = projet();

    p.ajouterPhoto(photo('facade'));
    p.ajouterPhoto(photo('sejour'));

    expect(p.photoPrincipale?.nomOriginal).toBe('facade.jpg');
    expect(p.photos.filter((ph) => ph.estPrincipale)).toHaveLength(1);
  });

  it('désigne une autre vignette sans en laisser deux', () => {
    const p = projet();
    p.ajouterPhoto(photo('facade'));
    p.ajouterPhoto(photo('sejour'));
    const sejour = p.photos.find((ph) => ph.nomOriginal === 'sejour.jpg')!;

    p.designerPhotoPrincipale(sejour.id);

    expect(p.photoPrincipale?.nomOriginal).toBe('sejour.jpg');
    expect(p.photos.filter((ph) => ph.estPrincipale)).toHaveLength(1);
  });

  it('rend la clé libérée au retrait, et promeut la suivante', () => {
    const p = projet();
    p.ajouterPhoto(photo('facade'));
    p.ajouterPhoto(photo('sejour'));
    const facade = p.photos.find((ph) => ph.nomOriginal === 'facade.jpg')!;

    expect(p.retirerPhoto(facade.id)).toBe('beown/projets/facade');
    expect(p.photoPrincipale?.nomOriginal).toBe('sejour.jpg');
  });

  it('signale une photo absente', () => {
    expect(() => projet().retirerPhoto('inconnue')).toThrow(
      PhotoDeProjetIntrouvableError,
    );
  });
});

describe('Project — publication du contenu', () => {
  it('porte blocs, photos et accroche dans son snapshot', () => {
    const p = projet();
    p.modifier({ descriptionCourte: 'Douze logements neufs.' });
    p.ajouterBloc(bloc('Le quartier'));
    p.ajouterPhoto(photo('facade'));

    const etat = p.toSnapshot();

    expect(etat.descriptionCourte).toBe('Douze logements neufs.');
    expect(etat.blocsDeContenu).toHaveLength(1);
    expect(etat.photos).toHaveLength(1);
  });

  it('efface l’accroche quand la modification pose null', () => {
    const p = projet();
    p.modifier({ descriptionCourte: 'Douze logements neufs.' });

    p.modifier({ descriptionCourte: null });

    expect(p.descriptionCourte).toBeNull();
  });

  it('laisse l’accroche en place quand la modification l’omet', () => {
    const p = projet();
    p.modifier({ descriptionCourte: 'Douze logements neufs.' });

    p.modifier({ titre: 'Résidence Horizon II' });

    expect(p.descriptionCourte).toBe('Douze logements neufs.');
  });

  it('ne permet pas de poser les blocs par une modification de champs', () => {
    const p = projet();
    p.ajouterBloc(bloc('Le quartier'));

    p.modifier({ blocsDeContenu: [] } as never);

    expect(p.blocsDeContenu).toHaveLength(1);
  });
});
