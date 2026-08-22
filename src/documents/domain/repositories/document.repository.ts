import type {
  SignableDocument,
  SignableDocumentNaissant,
} from '../aggregates/signable-document';

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

/**
 * La collection des documents (§10) — orientée agrégat, pas table.
 *
 * `creer` et `save` sont distincts parce que l'identité et la date de dépôt
 * naissent en base : un `SignableDocumentNaissant` entre, un agrégat complet
 * ressort.
 *
 * `setMainImage(id, projectId)` et `updateOrdre(id, ordre)` ont disparu :
 * c'étaient deux façons d'écrire des colonnes sans passer par l'agrégat (§6),
 * et « mettre à jour l'ordre » n'est pas une intention métier (§4). Leurs
 * appelants jouent désormais la transition sur l'agrégat, puis le sauvent.
 *
 * `designerImagePrincipale` reste, parce qu'elle porte une intention qu'aucun
 * `save` ne peut porter : une couverture désignée en décoiffe une autre. Cette
 * unicité s'étend à toutes les photos d'un projet, pas au document seul —
 * l'agrégat ne peut pas la garantir, le repository le fait en une opération.
 */
export interface DocumentRepository {
  /** Insère un document qui vient d'être déposé et rend l'agrégat complet. */
  creer(naissant: SignableDocumentNaissant): Promise<SignableDocument>;

  /** Persiste l'état d'un document existant (transition jouée). */
  save(document: SignableDocument): Promise<SignableDocument>;

  findById(id: string): Promise<SignableDocument | null>;

  findByUserId(userId: number): Promise<SignableDocument[]>;

  findByProjectId(projectId: string): Promise<SignableDocument[]>;

  findByInvestmentId(investmentId: string): Promise<SignableDocument[]>;

  /** La galerie d'un projet : couverture d'abord, puis par rang d'affichage. */
  findProjectImages(projectId: string): Promise<SignableDocument[]>;

  /**
   * Désigne l'unique image de couverture d'un projet : celle-ci la devient,
   * toutes les autres cessent de l'être.
   */
  designerImagePrincipale(
    document: SignableDocument,
  ): Promise<SignableDocument>;

  delete(id: string): Promise<void>;
}
