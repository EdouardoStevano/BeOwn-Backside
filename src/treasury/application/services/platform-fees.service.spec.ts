import { PlatformFeesService } from './platform-fees.service';
import {
  BaremeDesFrais,
  TAUX_PAR_DEFAUT,
} from 'src/treasury/domain/value-objects/bareme-des-frais.vo';

function monter(bareme = BaremeDesFrais.parDefaut()) {
  const baremes = { lire: jest.fn().mockResolvedValue(bareme) };

  return { service: new PlatformFeesService(baremes as never), baremes };
}

/**
 * Ce qui reste à éprouver ici est **la lecture**, et elle seule : les règles de
 * facturation sont dans `bareme-des-frais.vo.spec.ts`, où elles se testent sans
 * doubler une persistance pour vérifier une multiplication.
 */
describe('PlatformFeesService', () => {
  it('rend le barème courant', async () => {
    const attendu = BaremeDesFrais.restore({ propertySaleGainFeePct: 20 });
    const { service } = monter(attendu);

    await expect(service.lireLeBareme()).resolves.toBe(attendu);
  });

  it('publie les taux à plat pour la route publique', async () => {
    const { service } = monter();

    await expect(service.getRates()).resolves.toEqual(TAUX_PAR_DEFAUT);
  });

  it('un barème lu une fois s’applique autant de fois qu’on veut', async () => {
    // C'est la garantie que ce refactoring apporte : les frais d'une même
    // opération ne peuvent plus être calculés à deux taux différents parce
    // qu'un administrateur a modifié les commissions entre deux appels.
    const { service, baremes } = monter();

    const bareme = await service.lireLeBareme();
    bareme.fraisSurPlusValueDeSortie(10_000);
    bareme.fraisDeRevente(10_000, 1_000);

    expect(baremes.lire).toHaveBeenCalledTimes(1);
  });
});
