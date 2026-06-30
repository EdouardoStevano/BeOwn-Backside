import { PeriodeDistribution } from '../../../domains/periode-distribution';
import { PeriodeDistributionEntity } from '../entities/periode-distribution.entity';

export class PeriodeDistributionMapper {
  static toDomain(e: PeriodeDistributionEntity): PeriodeDistribution {
    const d = new PeriodeDistribution();
    d.id = e.id;
    d.projetId = e.projetId;
    d.periode = e.periode;
    d.totalLoyers = Number(e.totalLoyers);
    d.totalCharges = Number(e.totalCharges);
    d.revenuNet = Number(e.revenuNet);
    d.statut = e.statut;
    d.calculeeLe = e.calculeeLe;
    d.valideeLe = e.valideeLe;
    d.distribueeLe = e.distribueeLe;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: PeriodeDistribution): PeriodeDistributionEntity {
    const e = new PeriodeDistributionEntity();
    if (d.id) e.id = d.id;
    e.projetId = d.projetId;
    e.periode = d.periode;
    e.totalLoyers = d.totalLoyers;
    e.totalCharges = d.totalCharges;
    e.revenuNet = d.revenuNet;
    e.statut = d.statut;
    e.calculeeLe = d.calculeeLe;
    e.valideeLe = d.valideeLe;
    e.distribueeLe = d.distribueeLe;
    return e;
  }
}
