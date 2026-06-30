import { Charge } from '../../../domains/charge';
import { ChargeEntity } from '../entities/charge.entity';

export class ChargeMapper {
  static toDomain(e: ChargeEntity): Charge {
    const d = new Charge();
    d.id = e.id;
    d.projetId = e.projetId;
    d.type = e.type;
    d.description = e.description;
    d.montant = Number(e.montant);
    d.periode = e.periode;
    d.dateOperation = e.dateOperation;
    d.justificatifs = Array.isArray(e.justificatifs) ? e.justificatifs : [];
    d.statut = e.statut;
    d.declareParUserId = e.declareParUserId;
    d.valideParUserId = e.valideParUserId;
    d.valideLe = e.valideLe;
    d.motifRejet = e.motifRejet;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: Charge): ChargeEntity {
    const e = new ChargeEntity();
    if (d.id) e.id = d.id;
    e.projetId = d.projetId;
    e.type = d.type;
    e.description = d.description;
    e.montant = d.montant;
    e.periode = d.periode;
    e.dateOperation = d.dateOperation;
    e.justificatifs = d.justificatifs ?? [];
    e.statut = d.statut;
    e.declareParUserId = d.declareParUserId;
    e.valideParUserId = d.valideParUserId;
    e.valideLe = d.valideLe;
    e.motifRejet = d.motifRejet;
    return e;
  }
}
