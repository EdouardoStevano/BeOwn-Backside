import { PublicStatisticsService } from './public-statistics.service';

/**
 * Le service n'est qu'un agrégateur SQL caché 60 s : on caractérise le
 * MAPPING (et surtout le contrat « occupation absente → null, jamais 0 »)
 * avec un DataSource entièrement simulé — aucune base, aucun réseau.
 */
describe('PublicStatisticsService', () => {
  // Réponses des 4 requêtes, dans l'ordre du Promise.all du service.
  const buildDataSource = (rows: {
    projets?: any[];
    engagements?: any[];
    loyers?: any[];
    occupation?: any[];
  }) => ({
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM projet')) {
        return Promise.resolve(rows.projets ?? [{ finances: '2', en_collecte: '1' }]);
      }
      if (sql.includes('FROM investissement')) {
        return Promise.resolve(
          rows.engagements ?? [{ collecte: '5000', investisseurs: '3' }],
        );
      }
      if (sql.includes('FROM distribution_part')) {
        return Promise.resolve(rows.loyers ?? [{ brut: '120' }]);
      }
      if (sql.includes('unite_louable')) {
        return Promise.resolve(rows.occupation ?? [{ taux_moyen_pct: null }]);
      }
      throw new Error(`Requête inattendue : ${sql}`);
    }),
  });

  it("publie le taux d'occupation moyen agrégé en pourcentage numérique", async () => {
    const ds = buildDataSource({ occupation: [{ taux_moyen_pct: '73.3' }] });
    const service = new PublicStatisticsService(ds as any);

    const stats = await service.lire();

    expect(stats.tauxOccupationMoyenPct).toBe(73.3);
    expect(stats.projetsFinances).toBe(2);
    expect(stats.montantCollecteEur).toBe(5000);
  });

  it('aucune donnée locative → null, JAMAIS 0', async () => {
    const ds = buildDataSource({ occupation: [{ taux_moyen_pct: null }] });
    const service = new PublicStatisticsService(ds as any);

    const stats = await service.lire();

    expect(stats.tauxOccupationMoyenPct).toBeNull();
  });

  it('résultat SQL vide (aucune ligne) → null aussi', async () => {
    const ds = buildDataSource({ occupation: [] });
    const service = new PublicStatisticsService(ds as any);

    const stats = await service.lire();

    expect(stats.tauxOccupationMoyenPct).toBeNull();
  });

  it("la requête d'occupation réplique la définition du usecase locatif (baux ACTIFS, projets en_exploitation)", async () => {
    const ds = buildDataSource({});
    const service = new PublicStatisticsService(ds as any);

    await service.lire();

    const sqlOccupation = ds.query.mock.calls
      .map((c: any[]) => c[0] as string)
      .find((sql) => sql.includes('unite_louable'));
    expect(sqlOccupation).toContain("p.statut = 'en_exploitation'");
    expect(sqlOccupation).toContain("b.statut = 'actif'");
  });

  it('cache 60 s : un second appel immédiat ne retourne pas en base', async () => {
    const ds = buildDataSource({ occupation: [{ taux_moyen_pct: '50.0' }] });
    const service = new PublicStatisticsService(ds as any);

    const premier = await service.lire();
    const second = await service.lire();

    expect(ds.query).toHaveBeenCalledTimes(4); // un seul passage
    expect(second).toBe(premier);
  });

  it('cache expiré (> 60 s) : les agrégats sont relus', async () => {
    const ds = buildDataSource({});
    const service = new PublicStatisticsService(ds as any);
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1_000_000);
      await service.lire();
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      await service.lire();

      expect(ds.query).toHaveBeenCalledTimes(8);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
