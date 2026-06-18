import { Locataire } from '../../../domains/locataire';
import { LocataireEntity } from '../entities/locataire.entity';

export class LocataireMapper {
  static toDomain(e: LocataireEntity): Locataire {
    const d = new Locataire();
    d.id = e.id;
    d.nomComplet = e.nomComplet;
    d.email = e.email;
    d.telephone = e.telephone;
    d.spvId = e.spvId;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: Locataire): LocataireEntity {
    const e = new LocataireEntity();
    if (d.id) e.id = d.id;
    e.nomComplet = d.nomComplet;
    e.email = d.email;
    e.telephone = d.telephone;
    e.spvId = d.spvId;
    return e;
  }
}
