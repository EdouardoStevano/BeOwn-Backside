import {
  PROFONDEUR_PUBLICATION_MOIS,
  construirePublication,
  debutPeriodePublication,
} from './taux-defaut-publication';

const REFERENCE = new Date('2026-08-20T00:00:00Z');

const projet = (
  annee: number,
  overrides: Partial<{
    enDefaut: boolean;
    capitalCollecte: number;
    capitalPerteDefinitive: number;
  }> = {},
) => ({
  projetId: `${annee}-${Math.round(Math.abs(Math.sin(annee)) * 1e6)}`,
  ouvertLe: new Date(`${annee}-06-01T00:00:00Z`),
  capitalCollecte: overrides.capitalCollecte ?? 100_000,
  enDefaut: overrides.enDefaut ?? false,
  capitalPerteDefinitive: overrides.capitalPerteDefinitive ?? 0,
});

describe('debutPeriodePublication — art. 20(1)', () => {
  it('remonte trente-six mois', () => {
    expect(PROFONDEUR_PUBLICATION_MOIS).toBe(36);
    expect(debutPeriodePublication(REFERENCE).toISOString()).toBe(
      new Date('2023-08-20T00:00:00Z').toISOString(),
    );
  });
});

describe('construirePublication', () => {
  it('groupe les projets par cohorte annuelle', () => {
    const publication = construirePublication(
      [projet(2024), projet(2024), projet(2025)],
      REFERENCE,
    );

    expect(publication.cohortes.map((c) => c.annee)).toEqual([2024, 2025]);
    expect(publication.cohortes[0].nbProjets).toBe(2);
    expect(publication.cohortes[1].nbProjets).toBe(1);
  });

  it('calcule le taux de défaut par cohorte', () => {
    const publication = construirePublication(
      [projet(2024, { enDefaut: true }), projet(2024), projet(2024), projet(2024)],
      REFERENCE,
    );

    expect(publication.cohortes[0].tauxDefautProjets).toBe(25);
  });

  it('calcule le taux de perte sur le capital collecté', () => {
    const publication = construirePublication(
      [
        projet(2025, { capitalCollecte: 200_000, capitalPerteDefinitive: 50_000 }),
        projet(2025, { capitalCollecte: 200_000 }),
      ],
      REFERENCE,
    );

    expect(publication.cohortes[0].capitalCollecte).toBe(400_000);
    expect(publication.cohortes[0].tauxPerteCapital).toBe(12.5);
  });

  it('exclut les projets antérieurs à la fenêtre de trente-six mois', () => {
    const publication = construirePublication(
      [projet(2020, { enDefaut: true }), projet(2025)],
      REFERENCE,
    );

    expect(publication.cohortes.map((c) => c.annee)).toEqual([2025]);
    expect(publication.global.nbProjets).toBe(1);
    expect(publication.global.tauxDefautProjets).toBe(0);
  });

  it('ne fabrique pas de cohorte vide pour une année sans activité', () => {
    const publication = construirePublication([projet(2026)], REFERENCE);
    expect(publication.cohortes).toHaveLength(1);
    expect(publication.cohortes[0].annee).toBe(2026);
  });

  it('rend des agrégats neutres en l\'absence de projet', () => {
    const publication = construirePublication([], REFERENCE);
    expect(publication.cohortes).toEqual([]);
    expect(publication.global.nbProjets).toBe(0);
    expect(publication.global.tauxDefautProjets).toBe(0);
    expect(publication.global.tauxPerteCapital).toBe(0);
  });

  it('expose la méthodologie exigée par le RTS 2022/2115', () => {
    const publication = construirePublication([], REFERENCE);
    expect(publication.methodologie).toContain('90 jours');
    expect(publication.methodologie).toContain('2022/2115');
  });
});
