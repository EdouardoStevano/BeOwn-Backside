import { Spv } from './spv';
import { RegimeFiscal } from './enums/regime-fiscal.enum';

describe('Spv (domain)', () => {
  it('expose les champs hérités', () => {
    const s = new Spv();
    s.id = 'spv-1';
    s.raisonSociale = 'SCI Test';
    s.siren = '123456789';
    s.forme = 'SCI';
    s.capitalSocial = 1000;
    s.siegeAdresse = '1 rue X';
    s.iban = 'FR76...';

    expect(s.raisonSociale).toBe('SCI Test');
    expect(s.forme).toBe('SCI');
  });

  it('expose les nouveaux champs equity-locatif', () => {
    const s = new Spv();
    s.dateConstitution = new Date('2026-01-15');
    s.statutsPdfUrl = 'https://x/statuts.pdf';
    s.regimeFiscal = RegimeFiscal.IS;
    s.gestionnaireUserId = 42;

    expect(s.regimeFiscal).toBe(RegimeFiscal.IS);
    expect(s.gestionnaireUserId).toBe(42);
  });

  it('autorise null sur les nouveaux champs (rétrocompat avec Spv legacy)', () => {
    const s = new Spv();
    s.dateConstitution = null;
    s.statutsPdfUrl = null;
    s.gestionnaireUserId = null;
    expect(s.dateConstitution).toBeNull();
    expect(s.statutsPdfUrl).toBeNull();
    expect(s.gestionnaireUserId).toBeNull();
  });
});
