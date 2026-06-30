import { SortieProjet } from '../../../domains/sortie-projet';
import { SortieProjetEntity } from '../entities/sortie-projet.entity';

export class SortieProjetMapper {
  static toDomain(e: SortieProjetEntity): SortieProjet {
    const d = new SortieProjet();
    d.id = e.id;
    d.projetId = e.projetId;
    d.prixRevente = Number(e.prixRevente);
    d.dateRevente = e.dateRevente;
    d.plusValueBrute = Number(e.plusValueBrute);
    d.statut = e.statut;
    d.acteVentePdfUrl = e.acteVentePdfUrl;
    d.createdAt = e.createdAt;
    d.updatedAt = e.updatedAt;
    return d;
  }

  static toEntity(d: SortieProjet): SortieProjetEntity {
    const e = new SortieProjetEntity();
    if (d.id) e.id = d.id;
    e.projetId = d.projetId;
    e.prixRevente = d.prixRevente;
    e.dateRevente = d.dateRevente;
    e.plusValueBrute = d.plusValueBrute;
    e.statut = d.statut;
    e.acteVentePdfUrl = d.acteVentePdfUrl;
    return e;
  }
}
