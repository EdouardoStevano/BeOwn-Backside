import { Spv } from 'src/projects/domains/spv';

export const SPV_REPOSITORY = Symbol('SPV_REPOSITORY');

/**
 * Accès aux sociétés de projet, vu depuis le domaine.
 *
 * Extrait de `ProjectRepository`, dont il était le tiers inutilisé par tous ses
 * consommateurs (§4, ISP). Une SPV et un projet n'ont ni le même cycle de vie
 * ni les mêmes lecteurs : le catalogue lit des projets, l'administration
 * constitue des sociétés.
 */
export interface SpvRepository {
  saveSpv(spv: Spv): Promise<Spv>;
  findSpvById(id: string): Promise<Spv | null>;
  findAllSpv(): Promise<Spv[]>;
}
