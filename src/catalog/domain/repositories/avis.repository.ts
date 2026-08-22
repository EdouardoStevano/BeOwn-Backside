import type { Avis, AvisNaissant } from '../aggregates/avis';

export const AVIS_REPOSITORY = Symbol('AVIS_REPOSITORY');

/**
 * La collection des avis (§10) — orientée agrégat, pas table.
 *
 * `creer` et `save` sont distincts parce que l'identité et la date de dépôt
 * naissent en base : un `AvisNaissant` entre, un agrégat complet ressort. Le
 * `save(avis)` unique d'avant devait deviner l'intention en regardant si
 * `avis.id` était renseigné — un agrégat sans identité n'existe pas, et cette
 * ambiguïté disparaît avec lui.
 */
export interface AvisRepository {
  /** Insère un avis qui vient d'être déposé et rend l'agrégat complet. */
  creer(naissant: AvisNaissant): Promise<Avis>;

  /** Persiste l'état d'un avis existant (transition jouée). */
  save(avis: Avis): Promise<Avis>;

  /** Les avis d'un projet, du plus récent au plus ancien, auteur nommé. */
  findByProjetId(projetId: string): Promise<Avis[]>;

  /** L'avis d'un compte sur un projet — au plus un (RG : un seul par couple). */
  findByUserAndProjet(userId: number, projetId: string): Promise<Avis | null>;

  /** Note moyenne et nombre d'avis, pour la fiche projet (§11). */
  getStats(projetId: string): Promise<{ noteMoyenne: number; nbAvis: number }>;
}
