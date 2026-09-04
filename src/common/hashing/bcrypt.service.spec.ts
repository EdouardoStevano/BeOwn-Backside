import { genSalt, hash } from 'bcrypt';
import { BcryptService } from './bcrypt.service';

/**
 * `genSalt()` sans argument retenait 10, la valeur par défaut de la
 * bibliothèque. Le coût est encodé dans l'empreinte : le relever ne casse
 * aucune empreinte existante, `compare()` lisant le coût de l'empreinte
 * présentée.
 */
describe('BcryptService', () => {
  const service = new BcryptService();

  it('produit une empreinte de coût 12', async () => {
    const empreinte = await service.hash('mot-de-passe-solide');

    expect(empreinte).toMatch(/^\$2[aby]\$12\$/);
  });

  it('vérifie le bon mot de passe', async () => {
    const empreinte = await service.hash('mot-de-passe-solide');

    await expect(
      service.compare('mot-de-passe-solide', empreinte),
    ).resolves.toBe(true);
  });

  it('rejette un mauvais mot de passe', async () => {
    const empreinte = await service.hash('mot-de-passe-solide');

    await expect(service.compare('autre-chose', empreinte)).resolves.toBe(
      false,
    );
  });

  it('vérifie encore les empreintes de coût 10 déjà en base (aucune migration)', async () => {
    // Empreinte bcrypt de « mot-de-passe-solide » au coût 10, telle qu'elle
    // existe pour les comptes créés avant ce durcissement.
    const empreinteCout10 = await hash(
      'mot-de-passe-solide',
      await genSalt(10),
    );

    expect(empreinteCout10).toMatch(/^\$2[aby]\$10\$/);
    await expect(
      service.compare('mot-de-passe-solide', empreinteCout10),
    ).resolves.toBe(true);
  });
});
