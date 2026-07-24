import { DistributionPart } from '../../../domains/distribution-part';
import { DistributionPartEntity } from '../entities/distribution-part.entity';

export class DistributionPartMapper {
  static toDomain(e: DistributionPartEntity): DistributionPart {
    const d = new DistributionPart();
    d.id = e.id;
    d.periodeDistributionId = e.periodeDistributionId;
    d.investissementId = e.investissementId;
    d.pourcentageDetention = Number(e.pourcentageDetention);
    d.montantBrut = Number(e.montantBrut);
    d.prelevementIR = Number(e.prelevementIR);
    d.prelevementCSG = Number(e.prelevementCSG);
    d.montantNet = Number(e.montantNet);
    d.payeLe = e.payeLe;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: DistributionPart): DistributionPartEntity {
    const e = new DistributionPartEntity();
    if (d.id) e.id = d.id;
    e.periodeDistributionId = d.periodeDistributionId;
    e.investissementId = d.investissementId;
    e.pourcentageDetention = d.pourcentageDetention;
    e.montantBrut = d.montantBrut;
    e.prelevementIR = d.prelevementIR;
    e.prelevementCSG = d.prelevementCSG;
    e.montantNet = d.montantNet;
    e.payeLe = d.payeLe;
    return e;
  }
}
