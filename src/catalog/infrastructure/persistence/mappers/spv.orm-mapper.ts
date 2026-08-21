import { SpvMapper } from 'src/catalog/domain/mappers/spv.mapper';
import { Spv } from 'src/catalog/domain/aggregates/spv';
import { SpvEntity } from '../entities/spv.entity';

/** @see ProjectOrmMapper — même découpage : la table ici, l'agrégat au domaine. */
export class SpvOrmMapper {
  static toDomain(this: void, entity: SpvEntity): Spv {
    return SpvMapper.restore({
      id: entity.id,
      raisonSociale: entity.raisonSociale,
      siren: entity.siren,
      forme: entity.forme,
      capitalSocial:
        entity.capitalSocial != null ? Number(entity.capitalSocial) : null,
      siegeAdresse: entity.siegeAdresse,
      // Colonne `select: false` : absente de toute lecture qui ne la demande pas.
      iban: entity.iban,
      dateConstitution: entity.dateConstitution,
      statutsPdfUrl: entity.statutsPdfUrl,
      regimeFiscal: entity.regimeFiscal,
      gestionnaireUserId: entity.gestionnaireUserId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(spv: Spv): SpvEntity {
    const snapshot = spv.toSnapshot();
    const entity = new SpvEntity();
    if (snapshot.id) entity.id = snapshot.id;
    entity.raisonSociale = snapshot.raisonSociale;
    entity.siren = snapshot.siren;
    entity.forme = snapshot.forme;
    entity.capitalSocial = snapshot.capitalSocial;
    entity.siegeAdresse = snapshot.siegeAdresse;
    entity.iban = snapshot.iban;
    entity.dateConstitution = snapshot.dateConstitution;
    entity.statutsPdfUrl = snapshot.statutsPdfUrl;
    entity.regimeFiscal = snapshot.regimeFiscal;
    entity.gestionnaireUserId = snapshot.gestionnaireUserId;
    return entity;
  }
}
