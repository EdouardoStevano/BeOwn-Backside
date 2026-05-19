import { Bail } from '../../../domains/bail';

export const BAIL_REPOSITORY = Symbol('BAIL_REPOSITORY');

export interface BailRepository {
  save(b: Bail): Promise<Bail>;
  findById(id: string): Promise<Bail | null>;
  findByUniteLouable(uniteLouableId: string): Promise<Bail[]>;
  findActifsByProjet(projetId: string): Promise<Bail[]>;
}
