import { Investment, type InvestmentProjet } from 'src/investments/domains/investment';
import { Echeance } from 'src/investments/domains/echeance';
import { InvestmentEntity } from '../entities/investment.entity';
import { EcheanceEntity } from '../entities/echeance.entity';

export class InvestmentMapper {
  static toDomain(entity: InvestmentEntity): Investment {
    const d = new Investment();
    d.id = entity.id;
    d.projetId = entity.projetId;
    d.utilisateurId = entity.utilisateurId;
    d.montant = Number(entity.montant);
    d.instrument = entity.instrument;
    d.nbTitres = entity.nbTitres;
    d.valeurTitre =
      entity.valeurTitre != null ? Number(entity.valeurTitre) : null;
    d.statut = entity.statut;
    d.delaiRetractationJusquAu = entity.delaiRetractationJusquAu;
    d.bulletinDocId = entity.bulletinDocId;
    d.signatureId = entity.signatureId;
    d.reservationId = entity.reservationId;
    d.createdAt = entity.createdAt;
    d.updatedAt = entity.updatedAt;
    if (entity.projet) {
      d.projet = {
        id: entity.projet.id,
        titre: entity.projet.titre,
        ville: entity.projet.ville,
        pays: entity.projet.pays,
        type: entity.projet.type,
        triCible: entity.projet.triCible != null ? Number(entity.projet.triCible) : null,
        dureeMois: entity.projet.dureeMois,
        prixFraction: entity.projet.prixFraction != null ? Number(entity.projet.prixFraction) : null,
        nbFractions: entity.projet.nbFractions,
      } satisfies InvestmentProjet;
    }
    return d;
  }

  static toEntity(domain: Investment): InvestmentEntity {
    const e = new InvestmentEntity();
    if (domain.id) e.id = domain.id;
    e.projetId = domain.projetId;
    e.utilisateurId = domain.utilisateurId;
    e.montant = domain.montant;
    e.instrument = domain.instrument;
    e.nbTitres = domain.nbTitres;
    e.valeurTitre = domain.valeurTitre;
    e.statut = domain.statut;
    e.delaiRetractationJusquAu = domain.delaiRetractationJusquAu;
    e.bulletinDocId = domain.bulletinDocId;
    e.signatureId = domain.signatureId;
    e.reservationId = domain.reservationId;
    return e;
  }

  static echeanceToDomain(entity: EcheanceEntity): Echeance {
    const d = new Echeance();
    d.id = entity.id;
    d.investissementId = entity.investissementId;
    d.numero = entity.numero;
    d.datePrevue = entity.datePrevue;
    d.montantCapital = Number(entity.montantCapital);
    d.montantInterets = Number(entity.montantInterets);
    d.montantTotal = Number(entity.montantTotal);
    d.statut = entity.statut;
    d.payeLe = entity.payeLe;
    return d;
  }

  static echeanceToEntity(domain: Echeance): EcheanceEntity {
    const e = new EcheanceEntity();
    if (domain.id) e.id = domain.id;
    e.investissementId = domain.investissementId;
    e.numero = domain.numero;
    e.datePrevue = domain.datePrevue;
    e.montantCapital = domain.montantCapital;
    e.montantInterets = domain.montantInterets;
    e.montantTotal = domain.montantTotal;
    e.statut = domain.statut;
    e.payeLe = domain.payeLe;
    return e;
  }
}
