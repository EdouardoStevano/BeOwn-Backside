import {
  LangueNonSupporteeError,
  MfaNonModifiableParPreferenceError,
} from './errors/preferences.error';
import { Preferences } from './preferences';

describe('Preferences.defaut', () => {
  it('prévient par email mais ne prospecte pas', () => {
    const preferences = Preferences.defaut(42);

    // L'opt-out vaut pour le transactionnel, l'opt-in pour le marketing.
    expect(preferences.notifEmail).toBe(true);
    expect(preferences.notifMarketing).toBe(false);
    expect(preferences.langue).toBe('fr');
    expect(preferences.utilisateurId).toBe(42);
  });
});

describe('Preferences.modifier', () => {
  it('ne touche que les réglages déclarés', () => {
    const preferences = Preferences.defaut(42);

    expect(preferences.modifier({ notifSms: true })).toBe(true);

    expect(preferences.notifSms).toBe(true);
    expect(preferences.notifEmail).toBe(true);
    expect(preferences.langue).toBe('fr');
  });

  it("signale l'absence de changement plutôt que de réécrire", () => {
    const preferences = Preferences.defaut(42);

    expect(preferences.modifier({ notifEmail: true, langue: 'fr' })).toBe(
      false,
    );
  });

  it('accepte une langue servie par la plateforme', () => {
    const preferences = Preferences.defaut(42);

    preferences.modifier({ langue: '  EN ' });

    expect(preferences.langue).toBe('en');
  });

  it('refuse une langue que la plateforme ne sert pas', () => {
    const preferences = Preferences.defaut(42);

    expect(() => preferences.modifier({ langue: 'de' })).toThrow(
      LangueNonSupporteeError,
    );
  });

  it('laisse les réglages intacts quand une valeur est refusée', () => {
    const preferences = Preferences.defaut(42);

    expect(() =>
      preferences.modifier({ notifSms: true, langue: 'de' }),
    ).toThrow(LangueNonSupporteeError);

    expect(preferences.notifSms).toBe(false);
  });

  it("refuse d'armer la double authentification depuis une préférence", () => {
    // Le titulaire actionnait un interrupteur que la connexion ne lit pas :
    // il croyait protéger son compte sans que rien ne change.
    const preferences = Preferences.defaut(42);

    expect(() => preferences.modifier({ twoFactorEnabled: true })).toThrow(
      MfaNonModifiableParPreferenceError,
    );
  });

  it('refuse aussi de la désarmer', () => {
    // Retirer un facteur exige de prouver qu'on le possède encore : une
    // session volée ne doit pas suffire à désarmer le compte.
    const preferences = Preferences.defaut(42);

    expect(() => preferences.modifier({ twoFactorEnabled: false })).toThrow(
      MfaNonModifiableParPreferenceError,
    );
  });

  it('refuse le champ même noyé dans une mise à jour groupée', () => {
    const preferences = Preferences.defaut(42);

    expect(() =>
      preferences.modifier({ langue: 'en', twoFactorEnabled: true }),
    ).toThrow(MfaNonModifiableParPreferenceError);
    expect(preferences.langue).toBe('fr');
  });
});

describe('Preferences.toJSON', () => {
  it('publie les clés que le front lit déjà', () => {
    expect(Preferences.defaut(42).toJSON()).toEqual({
      userId: 42,
      utilisateurId: 42,
      langue: 'fr',
      masquerMontants: false,
      notifEmail: true,
      notifSms: false,
      notifMarketing: false,
      twoFactorEnabled: false,
      preferredCurrency: 'EUR',
    });
  });
});
