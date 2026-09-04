import { TauxDefautPublicationService } from './taux-defaut-publication.service';

/**
 * `GET /statistiques/taux-de-defaut` est publique et non authentifiée, et son
 * calcul lit les projets de la fenêtre PUIS deux fois par projet. Sans cache,
 * chaque appel anonyme déclenchait cette rafale : une route publique qui
 * amplifie le trafic en charge de base.
 */
describe('TauxDefautPublicationService — cache de publication', () => {
  const makeService = () => {
    const projectRepo = { find: jest.fn().mockResolvedValue([]) };
    return {
      service: new TauxDefautPublicationService(
        projectRepo as any,
        { find: jest.fn() } as any,
        { find: jest.fn() } as any,
      ),
      projectRepo,
    };
  };

  it('ne recalcule pas dans l’heure : une seule lecture des projets', async () => {
    const { service, projectRepo } = makeService();

    await service.publier();
    await service.publier();
    await service.publier();

    expect(projectRepo.find).toHaveBeenCalledTimes(1);
  });

  it('sert la MÊME publication depuis le cache', async () => {
    const { service } = makeService();

    const premiere = await service.publier();
    const seconde = await service.publier();

    expect(seconde).toBe(premiere);
  });

  it('recalcule après expiration du délai', async () => {
    const { service, projectRepo } = makeService();
    const maintenant = Date.now();
    const horloge = jest.spyOn(Date, 'now');

    horloge.mockReturnValue(maintenant);
    await service.publier();
    horloge.mockReturnValue(maintenant + 3_600_001);
    await service.publier();

    expect(projectRepo.find).toHaveBeenCalledTimes(2);
    horloge.mockRestore();
  });

  it('une date de référence explicite court-circuite le cache', async () => {
    const { service, projectRepo } = makeService();

    await service.publier();
    await service.publier(new Date('2025-01-01'));

    // Le rejeu à date fixe désigne un autre calcul : il ne lit ni n'écrit
    // l'entrée du calcul courant.
    expect(projectRepo.find).toHaveBeenCalledTimes(2);
  });

  it("le rejeu à date fixe n'empoisonne pas le cache courant", async () => {
    const { service, projectRepo } = makeService();

    await service.publier(new Date('2025-01-01'));
    await service.publier();
    await service.publier();

    expect(projectRepo.find).toHaveBeenCalledTimes(2);
  });
});
