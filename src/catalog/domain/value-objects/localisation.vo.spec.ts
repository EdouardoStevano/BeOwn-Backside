import { ChampProjetInvalideError } from '../errors/project.errors';
import { Localisation } from './localisation.vo';

describe('Localisation', () => {
  it('retombe sur FR quand le pays n’est pas donné', () => {
    expect(Localisation.of().pays).toBe('FR');
    expect(Localisation.of({ pays: null }).pays).toBe('FR');
    expect(Localisation.of({ pays: '  ' }).pays).toBe('FR');
  });

  it('normalise le code pays en majuscules', () => {
    expect(Localisation.of({ pays: 'ci' }).pays).toBe('CI');
  });

  it('refuse un code pays qui n’est pas ISO alpha-2', () => {
    expect(() => Localisation.of({ pays: 'FRA' })).toThrow(
      ChampProjetInvalideError,
    );
  });

  it('ramène une chaîne vide à null', () => {
    expect(Localisation.of({ ville: '   ' }).ville).toBeNull();
  });

  describe('coordonnées', () => {
    it('accepte une paire complète', () => {
      const paris = Localisation.of({ latitude: 48.85, longitude: 2.35 });
      expect(paris.latitude).toBe(48.85);
      expect(paris.longitude).toBe(2.35);
    });

    it('accepte l’absence des deux', () => {
      expect(Localisation.of().latitude).toBeNull();
    });

    it.each([
      ['latitude seule', { latitude: 48.85 }],
      ['longitude seule', { longitude: 2.35 }],
    ])('refuse une %s', (_libelle, coordonnees) => {
      expect(() => Localisation.of(coordonnees)).toThrow(
        ChampProjetInvalideError,
      );
    });

    it.each([-91, 91])('refuse une latitude de %s', (latitude) => {
      expect(() => Localisation.of({ latitude, longitude: 0 })).toThrow(
        ChampProjetInvalideError,
      );
    });

    it.each([-181, 181])('refuse une longitude de %s', (longitude) => {
      expect(() => Localisation.of({ latitude: 0, longitude })).toThrow(
        ChampProjetInvalideError,
      );
    });
  });

  describe('restore', () => {
    it('ne rejoue pas l’invariant de coordonnée — les lignes antérieures restent lisibles', () => {
      const relue = Localisation.restore({
        ville: 'Lyon',
        region: null,
        pays: 'FR',
        adresseComplete: null,
        latitude: 45.75,
        longitude: null,
      });

      expect(relue.latitude).toBe(45.75);
      expect(relue.longitude).toBeNull();
    });
  });

  describe('libelleCourt', () => {
    it('joint ville et pays', () => {
      expect(Localisation.of({ ville: 'Lyon', pays: 'FR' }).libelleCourt).toBe(
        'Lyon, FR',
      );
    });

    it('omet la ville absente', () => {
      expect(Localisation.of({ pays: 'FR' }).libelleCourt).toBe('FR');
    });
  });

  describe('avec', () => {
    it('undefined laisse en place, null efface', () => {
      const initiale = Localisation.of({ ville: 'Lyon', region: 'ARA' });
      expect(initiale.avec({ region: null }).ville).toBe('Lyon');
      expect(initiale.avec({ region: null }).region).toBeNull();
    });

    it('refuse une modification qui casse la paire de coordonnées', () => {
      const initiale = Localisation.of({ latitude: 45.75, longitude: 4.85 });
      expect(() => initiale.avec({ longitude: null })).toThrow(
        ChampProjetInvalideError,
      );
    });
  });
});
