import { Locataire } from '../../../domains/locataire';

export const LOCATAIRE_REPOSITORY = Symbol('LOCATAIRE_REPOSITORY');

export interface LocataireRepository {
  save(loc: Locataire): Promise<Locataire>;
  findById(id: string): Promise<Locataire | null>;
  findBySpv(spvId: string): Promise<Locataire[]>;
}
