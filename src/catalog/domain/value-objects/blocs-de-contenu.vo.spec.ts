import { BlocsDeContenu } from './blocs-de-contenu.vo';
import {
  BlocDeContenuIntrouvableError,
  CorpsDeBlocRequisError,
  PositionDeBlocInvalideError,
  ReordonnancementIncompletError,
  TitreDeBlocRequisError,
} from '../errors/contenu-projet.errors';

const bloc = (titre: string) => ({ titre, corps: `<p>${titre}</p>` });

/** Trois blocs, dans l'ordre où ils ont été écrits. */
const troisBlocs = () =>
  BlocsDeContenu.vide()
    .ajoutant(bloc('Le quartier'))
    .ajoutant(bloc('Le programme'))
    .ajoutant(bloc('Le montage'));

const titres = (suite: BlocsDeContenu) =>
  suite.toSnapshot().map((b) => b.titre);
const positions = (suite: BlocsDeContenu) =>
  suite.toSnapshot().map((b) => b.position);

describe('BlocsDeContenu — écriture', () => {
  it('pose un bloc en dernier par défaut', () => {
    expect(titres(troisBlocs())).toEqual([
      'Le quartier',
      'Le programme',
      'Le montage',
    ]);
  });

  it('insère à un rang donné, en reculant les suivants', () => {
    const suite = troisBlocs().ajoutant(bloc('En tête'), 0);

    expect(titres(suite)).toEqual([
      'En tête',
      'Le quartier',
      'Le programme',
      'Le montage',
    ]);
  });

  it('accepte le rang qui suit le dernier bloc', () => {
    expect(troisBlocs().ajoutant(bloc('En fin'), 3).nombre).toBe(4);
  });

  it('refuse un rang au-delà de la suite', () => {
    expect(() => troisBlocs().ajoutant(bloc('Trop loin'), 4)).toThrow(
      PositionDeBlocInvalideError,
    );
  });

  it('exige un titre et un texte', () => {
    expect(() =>
      BlocsDeContenu.vide().ajoutant({ titre: '  ', corps: '<p>x</p>' }),
    ).toThrow(TitreDeBlocRequisError);
    expect(() =>
      BlocsDeContenu.vide().ajoutant({ titre: 'Titre', corps: '   ' }),
    ).toThrow(CorpsDeBlocRequisError);
  });

  it('refuse un titre trop long', () => {
    expect(() => BlocsDeContenu.vide().ajoutant(bloc('t'.repeat(201)))).toThrow(
      TitreDeBlocRequisError,
    );
  });

  it('rogne les espaces du titre, mais pas le texte enrichi', () => {
    const [ecrit] = BlocsDeContenu.vide()
      .ajoutant({ titre: '  Le quartier  ', corps: '  <p>À dix minutes</p>  ' })
      .toSnapshot();

    expect(ecrit.titre).toBe('Le quartier');
    expect(ecrit.corps).toBe('  <p>À dix minutes</p>  ');
  });
});

describe('BlocsDeContenu — positions', () => {
  it('numérote toujours de 0 à n-1, sans trou', () => {
    expect(positions(troisBlocs())).toEqual([0, 1, 2]);
  });

  it('resserre les positions après un retrait', () => {
    const suite = troisBlocs();
    const milieu = suite.toSnapshot()[1].id;

    const apres = suite.sans(milieu);

    expect(titres(apres)).toEqual(['Le quartier', 'Le montage']);
    expect(positions(apres)).toEqual([0, 1]);
  });

  it('déplace un bloc et renumérote les autres', () => {
    const suite = troisBlocs();
    const dernier = suite.toSnapshot()[2].id;

    const apres = suite.deplacant(dernier, 0);

    expect(titres(apres)).toEqual([
      'Le montage',
      'Le quartier',
      'Le programme',
    ]);
    expect(positions(apres)).toEqual([0, 1, 2]);
  });

  it('refuse de déplacer au-delà du dernier rang', () => {
    const suite = troisBlocs();

    expect(() => suite.deplacant(suite.toSnapshot()[0].id, 3)).toThrow(
      PositionDeBlocInvalideError,
    );
  });
});

describe('BlocsDeContenu — réordonnancement', () => {
  it('réordonne la suite entière', () => {
    const suite = troisBlocs();
    const [a, b, c] = suite.toSnapshot().map((x) => x.id);

    expect(titres(suite.reordonnee([c, a, b]))).toEqual([
      'Le montage',
      'Le quartier',
      'Le programme',
    ]);
  });

  it('refuse une liste partielle plutôt que de compléter', () => {
    const suite = troisBlocs();
    const [a, b] = suite.toSnapshot().map((x) => x.id);

    expect(() => suite.reordonnee([a, b])).toThrow(
      ReordonnancementIncompletError,
    );
  });

  it('refuse un identifiant répété', () => {
    const suite = troisBlocs();
    const [a, b] = suite.toSnapshot().map((x) => x.id);

    expect(() => suite.reordonnee([a, a, b])).toThrow(
      ReordonnancementIncompletError,
    );
  });

  it('refuse un identifiant étranger à la fiche', () => {
    const suite = troisBlocs();
    const [a, b] = suite.toSnapshot().map((x) => x.id);

    expect(() => suite.reordonnee([a, b, 'bloc-d-un-autre-projet'])).toThrow(
      ReordonnancementIncompletError,
    );
  });
});

describe('BlocsDeContenu — modification', () => {
  it('réécrit un seul champ et laisse l’autre en place', () => {
    const suite = troisBlocs();
    const premier = suite.toSnapshot()[0].id;

    const [modifie] = suite
      .modifiant(premier, { titre: 'Le voisinage' })
      .toSnapshot();

    expect(modifie.titre).toBe('Le voisinage');
    expect(modifie.corps).toBe('<p>Le quartier</p>');
  });

  it('ne bouge pas le rang du bloc modifié', () => {
    const suite = troisBlocs();
    const milieu = suite.toSnapshot()[1].id;

    const apres = suite.modifiant(milieu, { corps: '<p>Réécrit</p>' });

    expect(apres.toSnapshot()[1].id).toBe(milieu);
  });

  it('signale un bloc absent', () => {
    expect(() => troisBlocs().modifiant('inconnu', { titre: 'x' })).toThrow(
      BlocDeContenuIntrouvableError,
    );
    expect(() => troisBlocs().sans('inconnu')).toThrow(
      BlocDeContenuIntrouvableError,
    );
  });

  it('ne laisse rien derrière une opération refusée', () => {
    const suite = troisBlocs();

    expect(() =>
      suite.modifiant(suite.toSnapshot()[0].id, { titre: '' }),
    ).toThrow();

    expect(titres(suite)).toEqual([
      'Le quartier',
      'Le programme',
      'Le montage',
    ]);
  });
});

describe('BlocsDeContenu — reconstitution', () => {
  it('tolère une colonne vide ou mal formée', () => {
    expect(BlocsDeContenu.restore(null).nombre).toBe(0);
    expect(BlocsDeContenu.restore(undefined).nombre).toBe(0);
    expect(BlocsDeContenu.restore('pas un tableau' as never).nombre).toBe(0);
  });

  it('relit la suite dans l’ordre des positions stockées', () => {
    const suite = BlocsDeContenu.restore([
      { id: 'b2', titre: 'Second', corps: '<p>2</p>', position: 1 },
      { id: 'b1', titre: 'Premier', corps: '<p>1</p>', position: 0 },
    ]);

    expect(titres(suite)).toEqual(['Premier', 'Second']);
  });

  it('renumérote des positions stockées incohérentes', () => {
    const suite = BlocsDeContenu.restore([
      { id: 'b1', titre: 'Premier', corps: '<p>1</p>', position: 7 },
      { id: 'b2', titre: 'Second', corps: '<p>2</p>', position: 9 },
    ]);

    expect(positions(suite)).toEqual([0, 1]);
  });

  it('écarte une entrée sans identifiant', () => {
    const suite = BlocsDeContenu.restore([
      { titre: 'Orphelin', corps: '<p>x</p>' } as never,
      { id: 'b1', titre: 'Premier', corps: '<p>1</p>', position: 0 },
    ]);

    expect(titres(suite)).toEqual(['Premier']);
  });

  it('ne rejoue pas les invariants sur ce qui est déjà écrit', () => {
    const suite = BlocsDeContenu.restore([
      { id: 'b1', titre: '', corps: '', position: 0 },
    ]);

    expect(suite.nombre).toBe(1);
  });
});
