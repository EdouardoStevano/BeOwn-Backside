import {
  EmailMethod,
  SmsMethod,
  TotpMethod,
  createTfaMethod,
} from './tfa-method';
import { TwoFactorMethod } from './enums/user.enum';
import {
  InvalidEmailError,
  InvalidPhoneNumberError,
  InvalidTotpSecretError,
} from './errors/user.errors';

describe('SmsMethod', () => {
  it('normalizes whitespace like the IAM SMS challenge does', () => {
    expect(SmsMethod.create('+33 6 12 34 56 78').credential).toBe(
      '+33612345678',
    );
  });

  it('rejects a number that is not E.164', () => {
    expect(() => SmsMethod.create('0612345678')).toThrow(
      InvalidPhoneNumberError,
    );
    expect(() => SmsMethod.create('+0612345678')).toThrow(
      InvalidPhoneNumberError,
    );
  });

  it('restores a persisted row without replaying the rules', () => {
    expect(SmsMethod.restore('0612345678').credential).toBe('0612345678');
  });
});

describe('EmailMethod', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(EmailMethod.create('  Jean.Dupont@Example.COM ').credential).toBe(
      'jean.dupont@example.com',
    );
  });

  it('rejects a malformed address', () => {
    expect(() => EmailMethod.create('not-an-email')).toThrow(InvalidEmailError);
  });
});

describe('TotpMethod', () => {
  it('accepts an otplib base32 secret', () => {
    expect(
      TotpMethod.create('GFI3XJMMK75FHOZCSUVOFCIGAPFQA7BN').credential,
    ).toBe('GFI3XJMMK75FHOZCSUVOFCIGAPFQA7BN');
  });

  it('rejects a secret that is not base32', () => {
    expect(() => TotpMethod.create('not-base32!')).toThrow(
      InvalidTotpSecretError,
    );
    expect(() => TotpMethod.create('')).toThrow(InvalidTotpSecretError);
  });
});

describe('createTfaMethod', () => {
  it('builds the subclass matching the channel, inactive by default', () => {
    const method = createTfaMethod(TwoFactorMethod.SMS, '+33612345678');
    expect(method).toBeInstanceOf(SmsMethod);
    expect(method.isActive).toBe(false);
  });

  it('activation stamps the date, deactivation keeps it', () => {
    const method = createTfaMethod(TwoFactorMethod.EMAIL, 'a@b.com');
    const at = new Date('2026-01-01T00:00:00Z');

    method.activate(at);
    expect(method.isActive).toBe(true);
    expect(method.activatedDate).toBe(at);

    method.deactivate();
    expect(method.isActive).toBe(false);
  });
});
