import { EmailMethod } from 'src/users/domains/tfa-method';

export const TFA_REPOSITORY = Symbol('TFA_REPOSITORY');

export interface TfaRepository {
  findEmailMethodByUserId(userId: number): Promise<EmailMethod | null>;
  saveEmailMethod(method: EmailMethod, userId: number): Promise<EmailMethod>;
}
