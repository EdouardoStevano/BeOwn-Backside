import { Bail } from '../../../domains/bail';
import { BailEntity } from '../entities/bail.entity';

export class BailMapper {
  static toDomain(e: BailEntity): Bail {
    const d = new Bail();
    d.id = e.id;
    d.uniteLouableId = e.uniteLouableId;
    d.locataireId = e.locataireId;
    d.loyerMensuel = Number(e.loyerMensuel);
    d.dateDebut = e.dateDebut;
    d.dateFin = e.dateFin;
    d.statut = e.statut;
    d.contratPdfUrl = e.contratPdfUrl;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: Bail): BailEntity {
    const e = new BailEntity();
    if (d.id) e.id = d.id;
    e.uniteLouableId = d.uniteLouableId;
    e.locataireId = d.locataireId;
    e.loyerMensuel = d.loyerMensuel;
    e.dateDebut = d.dateDebut;
    e.dateFin = d.dateFin;
    e.statut = d.statut;
    e.contratPdfUrl = d.contratPdfUrl;
    return e;
  }
}
