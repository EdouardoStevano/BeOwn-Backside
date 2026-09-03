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
 * `findProjectImages` et `designerImagePrincipale` ont disparu à leur tour. La
 * seconde était la dernière trace d'un aveu : elle existait « parce qu'aucun
 * `save` ne pouvait porter cette intention — une couverture désignée en décoiffe
 * une autre, et l'agrégat ne peut pas garantir cette unicité ». C'était exact,
 * et c'était le symptôme : un invariant qu'aucun agrégat ne peut tenir signale
 * que l'agrégat est mal découpé, pas qu'il faut le confier au repository (§6,
 * §17). La galerie est passée dans `Project`, où elle est une seule suite en
 * mémoire — l'unicité s'y tient sans écriture, et un `save()` l'enregistre.
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

  delete(id: string): Promise<void>;
}
