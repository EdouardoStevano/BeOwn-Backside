import { Avis, type AvisNaissant } from 'src/catalog/domain/aggregates/avis';
import { AvisEntity } from '../entities/avis.entity';

/** Ce que la lecture jointe rend en plus des colonnes de la table. */
export interface AvisAvecAuteur extends AvisEntity {
  userFirstname?: string | null;
  userLastname?: string | null;
}

/**
 * Traduit entre l'agrégat du domaine et les lignes TypeORM (§16).
 *
 * Le repository posait les champs un à un sur une instance vide, trois fois
 * dans le même fichier — ce que l'état privé de l'agrégat n'autorise plus.
 */
export class AvisOrmMapper {
  static toDomain(ligne: AvisAvecAuteur): Avis {
    return new Avis({
      id: ligne.id,
      projetId: ligne.projetId,
      userId: Number(ligne.userId),
      note: Number(ligne.note),
      commentaire: ligne.commentaire,
      createdAt: ligne.createdAt,
      userFirstname: ligne.userFirstname ?? null,
      userLastname: ligne.userLastname ?? null,
    });
  }

  /** Une ligne prête à être insérée, pour un avis qui vient d'être déposé. */
  static naissantToEntity(naissant: AvisNaissant): AvisEntity {
    const entity = new AvisEntity();
    entity.projetId = naissant.projetId;
    entity.userId = naissant.userId;
    entity.note = naissant.note;
    entity.commentaire = naissant.commentaire;
    return entity;
  }

  /**
   * Reporte l'état d'un agrégat sur la ligne dont il provient. Seuls la note et
   * le commentaire changent : un avis ne change ni d'auteur ni de projet.
   */
  static appliquerSur(entity: AvisEntity, avis: Avis): AvisEntity {
    const etat = avis.snapshot();
    entity.note = etat.note;
    entity.commentaire = etat.commentaire;
    return entity;
  }
}
