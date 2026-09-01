import { buildIndividualPrefill } from './connect-prefill';
import type { InvestorIdentity } from '../applications/ports/investor-identity.port';

/**
 * Ce module décide ce qui part vers Stripe à la création d'un compte de
 * retrait. Deux risques opposés sont couverts ici : transmettre une donnée
 * fausse (adresse amputée, numéro mal formé) et, à l'inverse, refuser une
 * donnée parfaitement valide et faire ressaisir l'investisseur pour rien.
 *
 * Aucune base, aucun réseau, aucun SDK : le module est pur.
 */
const identity = (over: Partial<InvestorIdentity> = {}): InvestorIdentity => ({
  firstName: 'Edouardo',
  lastName: 'Stevano',
  birthDate: new Date('2000-06-30T00:00:00.000Z'),
  addressLine1: '12 rue des Lilas',
  addressLine2: null,
  postalCode: '97400',
  city: 'Saint-Denis',
  country: 'FR',
  phone: '+262692000000',
  ...over,
});

describe('buildIndividualPrefill', () => {
  it('transmet un profil complet', () => {
    expect(buildIndividualPrefill(identity())).toEqual({
      first_name: 'Edouardo',
      last_name: 'Stevano',
      dob: { day: 30, month: 6, year: 2000 },
      address: {
        line1: '12 rue des Lilas',
        postal_code: '97400',
        city: 'Saint-Denis',
        country: 'FR',
      },
      phone: '+262692000000',
    });
  });

  it("n'invente rien quand il n'y a pas de profil", () => {
    expect(buildIndividualPrefill(null)).toBeUndefined();
    expect(buildIndividualPrefill(undefined)).toBeUndefined();
  });

  it('renvoie undefined quand tout est vide plutôt qu\'un objet creux', () => {
    const vide = identity({
      firstName: null,
      lastName: null,
      birthDate: null,
      addressLine1: null,
      postalCode: null,
      city: null,
      country: null,
      phone: null,
    });
    expect(buildIndividualPrefill(vide)).toBeUndefined();
  });

  describe('adresse — tout ou rien', () => {
    it.each(['addressLine1', 'postalCode', 'city', 'country'] as const)(
      'omet toute l\'adresse si %s manque, plutôt que d\'en envoyer une fausse',
      (champ) => {
        const result = buildIndividualPrefill(identity({ [champ]: null }));
        expect(result?.address).toBeUndefined();
        // Le reste du pré-remplissage survit : on ne jette pas le nom avec l'adresse.
        expect(result?.first_name).toBe('Edouardo');
      },
    );

    it('inclut la ligne 2 quand elle est renseignée', () => {
      const result = buildIndividualPrefill(
        identity({ addressLine2: 'Bâtiment C' }),
      );
      expect(result?.address?.line2).toBe('Bâtiment C');
    });

    it('met le pays en majuscules, la base pouvant le stocker en minuscules', () => {
      expect(buildIndividualPrefill(identity({ country: 'fr' }))?.address?.country).toBe('FR');
    });

    it('rejette un code pays qui n\'est pas un alpha-2', () => {
      expect(buildIndividualPrefill(identity({ country: 'FRA' }))?.address).toBeUndefined();
    });

    it('traite une chaîne d\'espaces comme une absence', () => {
      expect(buildIndividualPrefill(identity({ city: '   ' }))?.address).toBeUndefined();
    });
  });

  describe('téléphone', () => {
    it('accepte un E.164 espacé en le compactant', () => {
      expect(buildIndividualPrefill(identity({ phone: '+262 692 00 00 00' }))?.phone).toBe(
        '+262692000000',
      );
    });

    it.each(['0692000000', '692000000', 'non renseigné', '+0692000000'])(
      'omet %s, que Stripe rejetterait',
      (phone) => {
        expect(buildIndividualPrefill(identity({ phone }))?.phone).toBeUndefined();
      },
    );
  });

  describe('date de naissance', () => {
    it('accepte la forme chaîne renvoyée par certains pilotes TypeORM', () => {
      expect(
        buildIndividualPrefill(identity({ birthDate: '1985-01-02' as unknown as Date }))?.dob,
      ).toEqual({ day: 2, month: 1, year: 1985 });
    });

    it('lit en UTC : le jour ne glisse pas avec le fuseau', () => {
      expect(
        buildIndividualPrefill(identity({ birthDate: new Date('2000-06-30T23:30:00.000Z') }))
          ?.dob,
      ).toEqual({ day: 30, month: 6, year: 2000 });
    });

    it('omet une date illisible', () => {
      expect(
        buildIndividualPrefill(identity({ birthDate: new Date('pas une date') }))?.dob,
      ).toBeUndefined();
    });

    it.each([new Date('1789-07-14T00:00:00.000Z'), new Date('2400-01-01T00:00:00.000Z')])(
      'omet une année invraisemblable (%s)',
      (birthDate) => {
        expect(buildIndividualPrefill(identity({ birthDate }))?.dob).toBeUndefined();
      },
    );
  });
});
