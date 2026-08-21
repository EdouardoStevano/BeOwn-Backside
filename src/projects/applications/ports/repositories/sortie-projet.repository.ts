import { StatutSortie } from 'src/projects/domains/enums/statut-sortie.enum';
import { SortieProjet } from 'src/projects/domains/sortie-projet';

export const SORTIE_PROJET_REPOSITORY = Symbol('SORTIE_PROJET_REPOSITORY');

export interface SortieProjetRepository {
  save(s: SortieProjet): Promise<SortieProjet>;
  findById(id: string): Promise<SortieProjet | null>;
  findByProjet(projetId: string): Promise<SortieProjet[]>;
  findByStatut(statut: StatutSortie): Promise<SortieProjet[]>;
}
