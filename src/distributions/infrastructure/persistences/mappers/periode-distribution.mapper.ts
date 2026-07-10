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
    d.fraisPlateformeAnnuel = Number(e.fraisPlateformeAnnuel ?? 0);
    d.fraisGestionLocative = Number(e.fraisGestionLocative ?? 0);
    d.fraisPlafonnes = !!e.fraisPlafonnes;
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
    e.fraisPlateformeAnnuel = d.fraisPlateformeAnnuel ?? 0;
    e.fraisGestionLocative = d.fraisGestionLocative ?? 0;
    e.fraisPlafonnes = d.fraisPlafonnes ?? false;
    e.statut = d.statut;
    e.calculeeLe = d.calculeeLe;
    e.valideeLe = d.valideeLe;
    e.distribueeLe = d.distribueeLe;
    return e;
  }
}
