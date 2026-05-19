import { UniteLouable } from '../../../domains/unite-louable';
import { UniteLouableEntity } from '../entities/unite-louable.entity';

export class UniteLouableMapper {
  static toDomain(e: UniteLouableEntity): UniteLouable {
    const d = new UniteLouable();
    d.id = e.id;
    d.projetId = e.projetId;
    d.reference = e.reference;
    d.surfaceM2 = e.surfaceM2 != null ? Number(e.surfaceM2) : null;
    d.loyerMensuelCible = Number(e.loyerMensuelCible);
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: UniteLouable): UniteLouableEntity {
    const e = new UniteLouableEntity();
    if (d.id) e.id = d.id;
    e.projetId = d.projetId;
    e.reference = d.reference;
    e.surfaceM2 = d.surfaceM2;
    e.loyerMensuelCible = d.loyerMensuelCible;
    return e;
  }
}
