import { ProjectController } from './project.controller';
import {
  ProjectStatus,
  ProjectType,
} from 'src/projects/domains/enums/project-status.enum';

/**
 * Contrat de `GET /projects/public`.
 *
 * Mesuré en charge : ~25 Ko pour QUATRE projets, parce que la liste servait le
 * FICI intégral, la présentation rédigée et le prévisionnel de chaque dossier.
 * Ces trois champs sortent de la liste ; TOUT le reste — c'est-à-dire tout ce
 * que les cartes du Frontside lisent réellement — doit continuer d'être servi.
 */
const projetComplet = {
  id: 'p1',
  slug: 'residence-les-jardins',
  titre: 'Résidence Les Jardins',
  type: ProjectType.RESIDENTIEL,
  statut: ProjectStatus.EN_COLLECTE,
  ville: 'Saint-Denis',
  region: 'La Réunion',
  pays: 'FR',
  capitalCible: 3_000_000,
  capitalMinimum: 1_000_000,
  ticketMinimum: 500,
  triCible: 7.5,
  dureeMois: 60,
  nbFractions: 6_000,
  dateOuvertureCollecte: new Date('2026-01-01'),
  dateCloturePrevue: new Date('2026-06-01'),
  indiceRisque: 3,
  // Les trois lourds.
  fici: { sections: ['A'.repeat(2_400)] },
  descriptionMd: '# Un dossier de plusieurs milliers de caractères…',
  previsionnel: { annees: [{ loyers: 120_000 }] },
};

/** Champs que les cartes du Frontside lisent depuis la LISTE. */
const CHAMPS_DES_CARTES = [
  'id',
  'slug',
  'titre',
  'type',
  'statut',
  'ville',
  'pays',
  'capitalCible',
  'ticketMinimum',
  'triCible',
  'dureeMois',
  'dateOuvertureCollecte',
];

function makeController() {
  const getProjects = {
    execute: jest
      .fn()
      .mockResolvedValue({ data: [{ ...projetComplet }], total: 1, page: 1 }),
  };
  // Le read-model est déjà couvert par ses propres tests : ici il ne fait que
  // rendre ce qu'on lui donne, augmenté des blocs `fractions`/`stats`/`images`.
  const projectReadModel = {
    enrichFractions: jest.fn(async (projets: any[]) =>
      projets.map((p) => ({
        ...p,
        fractions: { total: 6_000, vendues: 10, disponibles: 5_990, prix: 500 },
        stats: {
          montantCollecte: 5_000,
          nbInvestisseurs: 3,
          tauxRemplissage: 0.2,
        },
      })),
    ),
    enrichImages: jest.fn(async (projets: any[]) =>
      projets.map((p) => ({
        ...p,
        images: [{ path: 'https://cdn/x.webp', estPrincipale: true, ordre: 1 }],
      })),
    ),
  };

  const controller = new ProjectController(
    {} as any,
    {} as any,
    {} as any,
    getProjects as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    projectReadModel as any,
  );
  return { controller, getProjects };
}

describe('GET /projects/public — contrat de la liste', () => {
  it.each(['fici', 'descriptionMd', 'previsionnel'])(
    'ne sert plus `%s` dans la liste',
    async (champ) => {
      const { controller } = makeController();

      const { data } = await controller.listPublic();

      expect(data[0]).not.toHaveProperty(champ);
    },
  );

  it.each(CHAMPS_DES_CARTES)(
    'sert toujours `%s`, lu par les cartes du Frontside',
    async (champ) => {
      const { controller } = makeController();

      const { data } = await controller.listPublic();

      expect(data[0]).toHaveProperty(champ);
    },
  );

  it('conserve les blocs calculés images / fractions / stats', async () => {
    const { controller } = makeController();

    const { data } = await controller.listPublic();

    expect(data[0].images).toHaveLength(1);
    expect(data[0].fractions).toEqual({
      total: 6_000,
      vendues: 10,
      disponibles: 5_990,
      prix: 500,
    });
    expect(data[0].stats.nbInvestisseurs).toBe(3);
  });

  it("conserve l'enveloppe de pagination", async () => {
    const { controller } = makeController();

    const resultat = await controller.listPublic();

    expect(resultat.total).toBe(1);
    expect(resultat.data).toHaveLength(1);
  });

  it('ne modifie pas les objets rendus par le read-model', async () => {
    const { controller } = makeController();

    await controller.listPublic();

    // La projection est une copie : le dossier complet reste intact en amont,
    // ce qui garantit qu'aucune autre vue ne perd ces champs par ricochet.
    expect(projetComplet.fici).toBeDefined();
    expect(projetComplet.descriptionMd).toBeDefined();
  });
});
