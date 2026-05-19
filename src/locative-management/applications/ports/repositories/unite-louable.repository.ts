import { UniteLouable } from '../../../domains/unite-louable';

export const UNITE_LOUABLE_REPOSITORY = Symbol('UNITE_LOUABLE_REPOSITORY');

export interface UniteLouableRepository {
  save(u: UniteLouable): Promise<UniteLouable>;
  findById(id: string): Promise<UniteLouable | null>;
  findByProjet(projetId: string): Promise<UniteLouable[]>;
}
