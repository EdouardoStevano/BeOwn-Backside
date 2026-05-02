import { TfaMethod } from 'src/users/domains/tfa-method';

export const TFA_REPOSITORY = Symbol('TFA_REPOSITORY');

export interface TfaRepository {
  save(): Promise<TfaMethod>;
}
