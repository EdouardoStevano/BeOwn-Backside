import { InvalidTelephoneError } from 'src/iam/domains/errors/profile.errors';
import { buildUser } from 'src/iam/domains/models/user.fixture';
import { NumeroTelephone } from './numero-telephone.vo';

/**
 * Ces cas éprouvaient le numéro à travers `Coordonnees`, quand il vivait sur le
 * dossier investisseur. Ils l'éprouvent désormais chez son propriétaire : le
 * compte. Les règles n'ont pas bougé, seul le contexte qui les porte.
 */
describe('NumeroTelephone.of', () => {
  it("ramène la forme européenne '00' à l'indicatif '+'", () => {
    // Sans quoi le même abonné apparaîtrait deux fois, sous deux écritures.
    expect(NumeroTelephone.of('0033 6 12 34 56 78')?.value).toBe(
      '+33612345678',
    );
  });

  it('conserve un numéro national tel quel, faute de pays de référence', () => {
    expect(NumeroTelephone.of('06 12 34 56 78')?.value).toBe('0612345678');
  });

  it('traite le vide comme une absence de numéro', () => {
    expect(NumeroTelephone.of('   ')).toBeNull();
    expect(NumeroTelephone.of(null)).toBeNull();
  });

  it('refuse un numéro trop court pour joindre qui que ce soit', () => {
    expect(() => NumeroTelephone.of('06')).toThrow(InvalidTelephoneError);
  });

  it('refuse un numéro qui contient autre chose que des chiffres', () => {
    // « à demander » et « 06 » étaient stockés tels quels : la campagne de
    // contact PSFP partait alors silencieusement incomplète.
    expect(() => NumeroTelephone.of('à demander')).toThrow(
      InvalidTelephoneError,
    );
  });

  it('désigne le champ fautif pour que le front le surligne', () => {
    try {
      NumeroTelephone.of('06');
    } catch (error) {
      expect((error as InvalidTelephoneError).details).toEqual({
        field: 'telephone',
      });
    }
  });
});

describe('NumeroTelephone.restore', () => {
  it('relit une ligne écrite avant que la règle existe', () => {
    // Refuser au chargement rendrait le compte inaccessible, y compris pour
    // corriger le numéro fautif.
    expect(NumeroTelephone.restore('06')?.value).toBe('06');
  });
});

describe('User.changerTelephone', () => {
  it('enregistre le numéro déclaré au formulaire de profil', () => {
    const compte = buildUser();

    expect(compte.changerTelephone('06 12 34 56 78')).toBe(true);
    expect(compte.telephone).toBe('0612345678');
  });

  it('ne bouge pas quand le numéro est le même, à la mise en forme près', () => {
    const compte = buildUser({ telephone: '0612345678' });

    expect(compte.changerTelephone('06.12.34.56.78')).toBe(false);
  });

  it("ne touche à rien quand le champ n'est pas déclaré", () => {
    const compte = buildUser({ telephone: '0612345678' });

    expect(compte.changerTelephone(undefined)).toBe(false);
    expect(compte.telephone).toBe('0612345678');
  });

  it('efface le numéro sur un `null` explicite', () => {
    const compte = buildUser({ telephone: '0612345678' });

    expect(compte.changerTelephone(null)).toBe(true);
    expect(compte.telephone).toBeNull();
  });

  it('refuse un numéro invalide sans laisser le compte à moitié modifié', () => {
    const compte = buildUser({ telephone: '0612345678' });

    expect(() => compte.changerTelephone('06')).toThrow(InvalidTelephoneError);
    expect(compte.telephone).toBe('0612345678');
  });
});
