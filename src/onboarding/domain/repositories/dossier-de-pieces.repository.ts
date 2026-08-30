import { DossierDePieces } from 'src/onboarding/domain/aggregates/dossier-de-pieces';

export const DOSSIER_DE_PIECES_REPOSITORY = Symbol(
  'DOSSIER_DE_PIECES_REPOSITORY',
);

/**
 * Accès en persistance aux pièces justificatives d'une société.
 *
 * Deux opérations, orientées métier et non génériques (§10) : on charge le
 * dossier **d'une société** pour le juger complet ou non, et on le sauvegarde
 * d'un bloc. Pas de `findAll`, pas de `delete` — une pièce ne se supprime pas,
 * elle se remplace, et la conservation de cinq ans (RG-KYC-10) l'exige de toute
 * façon.
 */
export interface DossierDePiecesRepository {
  /**
   * Le dossier d'une société — **jamais `null`**.
   *
   * Une société sans pièce a un dossier vide, pas d'absence de dossier : c'est
   * l'état de départ normal, et rendre `null` obligerait chaque appelant à le
   * traduire en dossier vierge, en l'oubliant parfois.
   */
  parSociete(societeId: string): Promise<DossierDePieces>;

  save(dossier: DossierDePieces): Promise<DossierDePieces>;
}
