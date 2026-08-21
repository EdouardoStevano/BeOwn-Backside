import { Chronologie, EtapeChronologie } from './chronologie.vo';

const etape = (date: string): EtapeChronologie => ({
  etape: `E-${date}`,
  date,
  statut: 'pending',
});

const statuts = (c: Chronologie) => c.toSnapshot().map((e) => e.statut);

describe('Chronologie', () => {
  const aujourdhui = new Date('2026-07-22T00:00:00Z');

  describe('avancerAu', () => {
    it('marque done le passé, in_progress la prochaine, pending le futur', () => {
      const avancee = Chronologie.restore([
        etape('2026-01-01'),
        etape('2026-07-01'),
        etape('2026-12-01'),
        etape('2027-01-01'),
      ]).avancerAu(aujourdhui);

      expect(statuts(avancee)).toEqual([
        'done',
        'done',
        'in_progress',
        'pending',
      ]);
    });

    it('toutes passées → toutes done, aucune in_progress', () => {
      const avancee = Chronologie.restore([
        etape('2020-01-01'),
        etape('2021-01-01'),
      ]).avancerAu(aujourdhui);

      expect(statuts(avancee)).toEqual(['done', 'done']);
    });

    it('toutes futures → première in_progress', () => {
      const avancee = Chronologie.restore([
        etape('2030-01-01'),
        etape('2031-01-01'),
      ]).avancerAu(aujourdhui);

      expect(statuts(avancee)).toEqual(['in_progress', 'pending']);
    });

    it('un jalon daté du jour même est done — la comparaison porte sur le jour, pas sur l’instant', () => {
      const avancee = Chronologie.restore([etape('2026-07-22')]).avancerAu(
        new Date('2026-07-22T23:59:59Z'),
      );

      expect(statuts(avancee)).toEqual(['done']);
    });

    it('vide → vide, sans lever', () => {
      expect(Chronologie.vide().avancerAu(aujourdhui).toSnapshot()).toEqual([]);
    });

    it('ne modifie pas la chronologie d’origine', () => {
      const origine = Chronologie.restore([etape('2020-01-01')]);
      origine.avancerAu(aujourdhui);

      expect(statuts(origine)).toEqual(['pending']);
    });
  });

  describe('restore', () => {
    it('tolère null et undefined — colonnes jsonb antérieures au défaut []', () => {
      expect(Chronologie.restore(null).estVide).toBe(true);
      expect(Chronologie.restore(undefined).estVide).toBe(true);
    });

    it('tolère une valeur qui n’est pas un tableau', () => {
      expect(
        Chronologie.restore('pas un tableau' as unknown as EtapeChronologie[])
          .estVide,
      ).toBe(true);
    });
  });

  describe('differeDe', () => {
    it('vrai quand un statut a changé', () => {
      const avant = Chronologie.restore([etape('2020-01-01')]);
      expect(avant.avancerAu(aujourdhui).differeDe(avant)).toBe(true);
    });

    it('faux quand rien n’a bougé — c’est ce qui évite une écriture au CRON', () => {
      const stable = Chronologie.restore([etape('2020-01-01')]).avancerAu(
        aujourdhui,
      );
      expect(stable.avancerAu(aujourdhui).differeDe(stable)).toBe(false);
    });

    it('vrai quand le nombre de jalons diffère', () => {
      expect(
        Chronologie.restore([etape('2020-01-01')]).differeDe(
          Chronologie.vide(),
        ),
      ).toBe(true);
    });
  });
});
