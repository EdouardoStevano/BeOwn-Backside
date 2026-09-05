import { ExchangeRatesService } from './exchange-rates.service';
import { normaliserTaux } from '../domains/exchange-rates';

/**
 * La clé du fournisseur vivait dans une variable `VITE_*` du front, inlinée
 * dans le bundle : lisible par quiconque ouvrait les sources, et utilisable
 * jusqu'à épuisement du quota. Le proxy la ramène côté serveur — mais une
 * route PUBLIQUE qui appelle un fournisseur facturé au quota doit être cachée,
 * sans quoi n'importe qui vide l'abonnement en bouclant sur l'URL.
 */
describe('ExchangeRatesService', () => {
  const makeService = (provider: { lireTauxDepuisEuro: jest.Mock }) => ({
    service: new ExchangeRatesService(provider as any),
    provider,
  });

  const providerOk = () => ({
    lireTauxDepuisEuro: jest.fn().mockResolvedValue({ XOF: 655.96, USD: 1.08 }),
  });

  it('sert les taux avec la base EUR et un horodatage', async () => {
    const { service } = makeService(providerOk());

    const taux = await service.lire();

    expect(taux).toMatchObject({
      base: 'EUR',
      rates: { XOF: 655.96, USD: 1.08 },
    });
    expect(Date.parse(taux!.fetchedAt)).not.toBeNaN();
  });

  it("n'appelle le fournisseur QU'UNE FOIS dans l'heure", async () => {
    const { service, provider } = makeService(providerOk());

    await service.lire();
    await service.lire();
    await service.lire();

    expect(provider.lireTauxDepuisEuro).toHaveBeenCalledTimes(1);
  });

  it('rappelle le fournisseur après expiration du délai', async () => {
    const { service, provider } = makeService(providerOk());
    const maintenant = Date.now();
    const horloge = jest.spyOn(Date, 'now');

    horloge.mockReturnValue(maintenant);
    await service.lire();
    horloge.mockReturnValue(maintenant + 3_600_001);
    await service.lire();

    expect(provider.lireTauxDepuisEuro).toHaveBeenCalledTimes(2);
    horloge.mockRestore();
  });

  describe('fournisseur indisponible', () => {
    it("sert la dernière lecture connue, avec son horodatage d'origine", async () => {
      const provider = providerOk();
      const { service } = makeService(provider);
      const maintenant = Date.now();
      const horloge = jest.spyOn(Date, 'now').mockReturnValue(maintenant);

      const premier = await service.lire();
      provider.lireTauxDepuisEuro.mockResolvedValue(null);
      horloge.mockReturnValue(maintenant + 3_600_001);
      const second = await service.lire();

      expect(second).toEqual(premier);
      // L'horodatage n'est PAS rafraîchi : l'appelant doit pouvoir voir que la
      // donnée a vieilli.
      expect(second!.fetchedAt).toBe(premier!.fetchedAt);
      horloge.mockRestore();
    });

    it('retente au prochain appel plutôt que d’attendre une heure', async () => {
      const provider = providerOk();
      const { service } = makeService(provider);
      const maintenant = Date.now();
      const horloge = jest.spyOn(Date, 'now').mockReturnValue(maintenant);

      await service.lire();
      provider.lireTauxDepuisEuro.mockResolvedValue(null);
      horloge.mockReturnValue(maintenant + 3_600_001);
      await service.lire();
      await service.lire();

      expect(provider.lireTauxDepuisEuro).toHaveBeenCalledTimes(3);
      horloge.mockRestore();
    });

    it('rend null si aucune lecture n’a jamais abouti', async () => {
      const { service } = makeService({
        lireTauxDepuisEuro: jest.fn().mockResolvedValue(null),
      });

      await expect(service.lire()).resolves.toBeNull();
    });

    it('un jeu de taux vide vaut indisponible', async () => {
      const { service } = makeService({
        lireTauxDepuisEuro: jest.fn().mockResolvedValue({}),
      });

      await expect(service.lire()).resolves.toBeNull();
    });
  });
});

describe('normaliserTaux', () => {
  it('ne retient que des codes ISO et des nombres exploitables', () => {
    expect(
      normaliserTaux({
        XOF: 655.96,
        USD: '1.08',
        EURO: 1,
        xof: 655,
        ZZZ: 0,
        AAA: -2,
        BBB: 'abc',
        CCC: null,
        DDD: Infinity,
      }),
    ).toEqual({ XOF: 655.96, USD: 1.08 });
  });

  it('tolère une charge utile absente', () => {
    expect(normaliserTaux(null)).toEqual({});
    expect(normaliserTaux(undefined)).toEqual({});
  });
});
