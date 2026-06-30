import { LoyerEncaisse } from '../../../domains/loyer-encaisse';
import { LoyerEncaisseEntity } from '../entities/loyer-encaisse.entity';

export class LoyerEncaisseMapper {
  static toDomain(e: LoyerEncaisseEntity): LoyerEncaisse {
    const d = new LoyerEncaisse();
    d.id = e.id;
    d.bailId = e.bailId;
    d.periode = e.periode;
    d.montant = Number(e.montant);
    d.dateEncaissement = e.dateEncaissement;
    d.preuves = Array.isArray(e.preuves) ? e.preuves : [];
    d.statut = e.statut;
    d.declareParUserId = e.declareParUserId;
    d.valideParUserId = e.valideParUserId;
    d.valideLe = e.valideLe;
    d.motifRejet = e.motifRejet;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: LoyerEncaisse): LoyerEncaisseEntity {
    const e = new LoyerEncaisseEntity();
    if (d.id) e.id = d.id;
    e.bailId = d.bailId;
    e.periode = d.periode;
    e.montant = d.montant;
    e.dateEncaissement = d.dateEncaissement;
    e.preuves = d.preuves ?? [];
    e.statut = d.statut;
    e.declareParUserId = d.declareParUserId;
    e.valideParUserId = d.valideParUserId;
    e.valideLe = d.valideLe;
    e.motifRejet = d.motifRejet;
    return e;
  }
}
