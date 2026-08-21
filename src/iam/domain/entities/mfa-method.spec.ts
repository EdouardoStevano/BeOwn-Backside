import { MfaMethod } from './mfa-method';
import { MfaMethodType } from '../enums/mfa-method.enum';
import { MfaCredentialMismatchError } from '../errors';

const factor = (
  method: MfaMethodType,
  credential: string,
  isActive = true,
): MfaMethod => MfaMethod.rehydrate({ id: 1, method, isActive, credential });

const email = (address = 'jean.dupont@example.com', isActive = true) =>
  factor(MfaMethodType.EMAIL, address, isActive);

const sms = (phone = '+33612345678') => factor(MfaMethodType.SMS, phone);

const totp = () => factor(MfaMethodType.TOTP, 'enc:v1:secret-chiffré');

describe('MfaMethod', () => {
  describe('état', () => {
    it('sépare le facteur confirmé de celui qui attend sa preuve', () => {
      expect(email().isActive()).toBe(true);
      expect(email().isPending()).toBe(false);

      const pending = email('jean@example.com', false);
      expect(pending.isActive()).toBe(false);
      expect(pending.isPending()).toBe(true);
    });

    it('ne reconnaît comme expéditeurs de code que l’email et le SMS', () => {
      expect(email().deliversCode()).toBe(true);
      expect(sms().deliversCode()).toBe(true);
      // TOTP fait calculer le code par l'application de l'utilisateur.
      expect(totp().deliversCode()).toBe(false);
    });
  });

  describe('isActiveOn', () => {
    it('exige les deux conditions à la fois', () => {
      expect(email().isActiveOn('jean.dupont@example.com')).toBe(true);
      // Bonne destination, mais facteur pas encore confirmé : il ne protège
      // rien, et le traiter comme en place bloquerait un enrôlement légitime.
      expect(
        email('jean.dupont@example.com', false).isActiveOn(
          'jean.dupont@example.com',
        ),
      ).toBe(false);
      expect(email().isActiveOn('autre@example.com')).toBe(false);
    });
  });

  describe('accès au credential', () => {
    it('rend la destination des canaux qui en ont une', () => {
      expect(email().destination).toBe('jean.dupont@example.com');
      expect(sms().destination).toBe('+33612345678');
    });

    it('refuse de lire un secret TOTP comme une destination', () => {
      // Sans cette garde, un secret chiffré partirait dans une réponse HTTP là
      // où l'appelant croit publier une adresse.
      expect(() => totp().destination).toThrow(MfaCredentialMismatchError);
    });

    it('rend le secret chiffré du TOTP', () => {
      expect(totp().encryptedSecret).toBe('enc:v1:secret-chiffré');
    });

    it('refuse de lire une adresse comme un secret', () => {
      // Sinon on la passerait au déchiffrement.
      expect(() => email().encryptedSecret).toThrow(MfaCredentialMismatchError);
      expect(() => sms().encryptedSecret).toThrow(MfaCredentialMismatchError);
    });
  });

  describe('maskedDestination', () => {
    it('laisse reconnaître une adresse sans la révéler', () => {
      expect(email().maskedDestination()).toBe('j***t@example.com');
      // Partie locale trop courte pour garder deux extrémités distinctes.
      expect(email('ab@example.com').maskedDestination()).toBe(
        'a***@example.com',
      );
      expect(email('sansarobase').maskedDestination()).toBe('***');
    });

    it('garde l’indicatif et la fin d’un numéro', () => {
      expect(sms().maskedDestination()).toBe('+33*******78');
      expect(sms('+3361').maskedDestination()).toBe('***');
    });

    it('ne rend rien pour TOTP, qui n’a pas de destination', () => {
      expect(totp().maskedDestination()).toBeUndefined();
    });

    it('ne laisse jamais fuiter la destination complète', () => {
      const address = 'jean.dupont@example.com';
      const masked = email(address).maskedDestination();

      expect(masked).not.toContain('jean.dupont');
      expect(masked).toContain('@example.com');
    });
  });
});
