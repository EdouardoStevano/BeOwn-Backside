import { ServiceUnavailableException } from '@nestjs/common';
import { ExchangeRatesController } from './exchange-rates.controller';

describe('ExchangeRatesController', () => {
  const makeController = (valeur: unknown) =>
    new ExchangeRatesController({
      lire: jest.fn().mockResolvedValue(valeur),
    } as any);

  it('sert le contrat attendu par le front : { base, rates, fetchedAt }', async () => {
    const taux = {
      base: 'EUR',
      rates: { XOF: 655.96 },
      fetchedAt: '2026-09-04T10:00:00.000Z',
    };

    await expect(makeController(taux).lire()).resolves.toEqual(taux);
  });

  it('rend 503 quand aucun taux n’est disponible', async () => {
    // Le front traite l'échec comme « taux indisponibles » et conserve ses
    // valeurs de repli plutôt que d'afficher des montants convertis à tort.
    await expect(makeController(null).lire()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
