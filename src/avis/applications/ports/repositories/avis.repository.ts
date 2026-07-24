import { Avis } from 'src/avis/domains/avis';

export const AVIS_REPOSITORY = Symbol('AVIS_REPOSITORY');

export interface AvisRepository {
  save(avis: Avis): Promise<Avis>;
  findByProjetId(projetId: string): Promise<Avis[]>;
  findByUserAndProjet(userId: number, projetId: string): Promise<Avis | null>;
  getStats(projetId: string): Promise<{ noteMoyenne: number; nbAvis: number }>;
}
