import { AnnoncesExpiryCronService } from './annonces-expiry-cron.service';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';

/**
 * Balayage des annonces échues — le geste qui rend l'état d'une annonce
 * conforme à la date de validité que son vendeur a lui-même fixée.
 */
describe('AnnoncesExpiryCronService', () => {
  const build = (
    echues: any[],
    options: { affected?: (ordreId: string) => number } = {},
  ) => {
    const clausesLecture: Array<[string, any]> = [];
    const transitions: Array<{ id: string; set: any }> = [];

    const ordreRepo = {
      createQueryBuilder: jest.fn((alias?: string) => {
        if (alias) {
          // Lecture des annonces échues.
          const qb: any = {
            where: jest.fn((clause: string, params: any) => {
              clausesLecture.push([clause, params]);
              return qb;
            }),
            andWhere: jest.fn((clause: string, params: any) => {
              clausesLecture.push([clause, params]);
              return qb;
            }),
            getMany: jest.fn(async () => echues),
          };
          return qb;
        }
        // Transition conditionnelle, une par annonce.
        let valeurs: any = null;
        let cible: any = null;
        const qb: any = {
          update: jest.fn(() => qb),
          set: jest.fn((v: any) => {
            valeurs = v;
            return qb;
          }),
          where: jest.fn((_clause: string, params: any) => {
            cible = params;
            return qb;
          }),
          execute: jest.fn(async () => {
            const affected = options.affected ? options.affected(cible.id) : 1;
            if (affected) transitions.push({ id: cible.id, set: valeurs });
            return { affected };
          }),
        };
        return qb;
      }),
    };

    const notifications = { push: jest.fn().mockResolvedValue(undefined) };
    const metrics = {
      incrementCounter: jest.fn(),
      observeHistogram: jest.fn(),
      setGauge: jest.fn(),
    };

    const service = new AnnoncesExpiryCronService(
      ordreRepo as any,
      notifications as any,
      metrics as any,
    );
    return { service, notifications, metrics, clausesLecture, transitions };
  };

  const annonce = (id: string) => ({
    id,
    vendeurId: 7,
    nbFractions: 5,
    valideJusquAu: '2020-01-01',
  });

  it('ne lit que les annonces EN_CARNET dont la validité est dépassée', async () => {
    const { service, clausesLecture } = build([]);

    await service.expirerAnnoncesEchues();

    const clauses = clausesLecture.map(([clause]) => clause);
    expect(clauses).toContainEqual('ord.statut = :statut');
    expect(clauses).toContainEqual('ord."valideJusquAu" IS NOT NULL');
    expect(clauses).toContainEqual('ord."valideJusquAu" < :jourLimite');
    expect(clausesLecture[0][1]).toEqual({
      statut: OrdreMarcheStatus.EN_CARNET,
    });
  });

  it('passe les annonces échues en EXPIRE et prévient leur vendeur', async () => {
    const { service, transitions, notifications } = build([
      annonce('o-1'),
      annonce('o-2'),
    ]);

    await expect(service.expirerAnnoncesEchues()).resolves.toBe(2);

    expect(transitions).toEqual([
      { id: 'o-1', set: { statut: OrdreMarcheStatus.EXPIRE } },
      { id: 'o-2', set: { statut: OrdreMarcheStatus.EXPIRE } },
    ]);
    expect(notifications.push).toHaveBeenCalledTimes(2);
    expect(notifications.push.mock.calls[0][0].utilisateurId).toBe(7);
  });

  it("n'expire pas une annonce qui vient de recevoir une marque d'intérêt", async () => {
    // La transition conditionnelle ne trouve plus l'annonce EN_CARNET :
    // l'annonce n'est pas retirée sous les pieds de son acheteur.
    const { service, notifications } = build([annonce('o-1')], {
      affected: () => 0,
    });

    await expect(service.expirerAnnoncesEchues()).resolves.toBe(0);
    expect(notifications.push).not.toHaveBeenCalled();
  });

  it('rien à expirer : aucune écriture, aucune notification', async () => {
    const { service, transitions, notifications } = build([]);

    await expect(service.expirerAnnoncesEchues()).resolves.toBe(0);
    expect(transitions).toHaveLength(0);
    expect(notifications.push).not.toHaveBeenCalled();
  });
});
