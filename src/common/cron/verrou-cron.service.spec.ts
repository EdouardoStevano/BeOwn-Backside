import { VerrouCronService } from './verrou-cron.service';

/**
 * `@Cron` s'exécute dans CHAQUE réplique. Derrière un HPA à six pods, six
 * exemplaires de chaque balayeur démarrent à la même seconde sur les mêmes
 * lignes. Ce verrou consultatif PostgreSQL n'en laisse travailler qu'un.
 */
describe('VerrouCronService', () => {
  const construire = ({ obtenu = true }: { obtenu?: boolean } = {}) => {
    const requetes: Array<{ sql: string; params: unknown[] }> = [];
    const runner: any = {
      connect: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        requetes.push({ sql, params });
        if (sql.includes('pg_try_advisory_lock')) return [{ obtenu }];
        return [{ pg_advisory_unlock: true }];
      }),
    };
    const dataSource: any = { createQueryRunner: jest.fn(() => runner) };
    return { service: new VerrouCronService(dataSource), runner, requetes };
  };

  it('exécute le traitement quand le verrou est obtenu', async () => {
    const { service } = construire({ obtenu: true });
    const traitement = jest.fn().mockResolvedValue('fait');

    await expect(service.executerSiSeul('cron-a', traitement)).resolves.toBe(
      'fait',
    );
    expect(traitement).toHaveBeenCalledTimes(1);
  });

  it("N'EXÉCUTE PAS le traitement quand le verrou est déjà tenu", async () => {
    const { service } = construire({ obtenu: false });
    const traitement = jest.fn();

    await expect(service.executerSiSeul('cron-a', traitement)).resolves.toBeNull();
    expect(traitement).not.toHaveBeenCalled();
  });

  it('libère le verrou après un traitement réussi', async () => {
    const { service, requetes } = construire();

    await service.executerSiSeul('cron-a', async () => undefined);

    expect(requetes.map((r) => r.sql).join(' ')).toContain('pg_advisory_unlock');
  });

  it('libère le verrou MÊME si le traitement lève', async () => {
    const { service, requetes } = construire();

    await expect(
      service.executerSiSeul('cron-a', async () => {
        throw new Error('panne du balayeur');
      }),
    ).rejects.toThrow('panne du balayeur');

    // Sans le `finally`, un incident laisserait la tâche bloquée jusqu'au
    // prochain redémarrage du pod.
    expect(requetes.map((r) => r.sql).join(' ')).toContain('pg_advisory_unlock');
  });

  it('rend toujours la connexion au pool', async () => {
    const { service, runner } = construire();

    await service
      .executerSiSeul('cron-a', async () => {
        throw new Error('panne');
      })
      .catch(() => undefined);

    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('ne tente PAS de libérer un verrou qu’il n’a pas obtenu', async () => {
    const { service, requetes } = construire({ obtenu: false });

    await service.executerSiSeul('cron-a', async () => undefined);

    expect(requetes.map((r) => r.sql).join(' ')).not.toContain(
      'pg_advisory_unlock',
    );
  });

  describe('cleDepuisNom', () => {
    it('est déterministe', () => {
      expect(VerrouCronService.cleDepuisNom('distributions')).toBe(
        VerrouCronService.cleDepuisNom('distributions'),
      );
    });

    it('distingue deux tâches', () => {
      expect(VerrouCronService.cleDepuisNom('distributions')).not.toBe(
        VerrouCronService.cleDepuisNom('retraits'),
      );
    });

    it('tient dans un entier signé 64 bits (contrainte de pg_advisory_lock)', () => {
      for (const nom of ['a', 'distributions', 'ordres-orphelins', 'x'.repeat(200)]) {
        const cle = BigInt(VerrouCronService.cleDepuisNom(nom));
        expect(cle >= 0n).toBe(true);
        expect(cle <= BigInt('0x7fffffffffffffff')).toBe(true);
      }
    });

    it('conserve toute la précision (pas de flottant)', () => {
      // Au-delà de 2^53, un Number perdrait des bits de poids faible et deux
      // tâches distinctes pourraient partager une clé.
      const cle = VerrouCronService.cleDepuisNom('distributions');
      expect(cle).toBe(BigInt(cle).toString());
    });
  });
});
