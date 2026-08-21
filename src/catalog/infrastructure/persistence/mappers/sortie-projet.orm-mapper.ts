import { SortieProjetMapper } from 'src/catalog/domain/mappers/sortie-projet.mapper';
import { SortieProjet } from 'src/catalog/domain/aggregates/sortie-projet';
import { SortieProjetEntity } from '../entities/sortie-projet.entity';

/** @see ProjectOrmMapper — même découpage. */
export class SortieProjetOrmMapper {
  static toDomain(this: void, entity: SortieProjetEntity): SortieProjet {
    return SortieProjetMapper.restore({
      id: entity.id,
      projetId: entity.projetId,
      prixRevente: Number(entity.prixRevente),
      dateRevente: entity.dateRevente,
      plusValueBrute: Number(entity.plusValueBrute),
      statut: entity.statut,
      acteVentePdfUrl: entity.acteVentePdfUrl,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(sortie: SortieProjet): SortieProjetEntity {
    const snapshot = sortie.toSnapshot();
    const entity = new SortieProjetEntity();
    if (snapshot.id) entity.id = snapshot.id;
    entity.projetId = snapshot.projetId;
    entity.prixRevente = snapshot.prixRevente;
    entity.dateRevente = snapshot.dateRevente;
    entity.plusValueBrute = snapshot.plusValueBrute;
    entity.statut = snapshot.statut;
    entity.acteVentePdfUrl = snapshot.acteVentePdfUrl;
    return entity;
  }
}
