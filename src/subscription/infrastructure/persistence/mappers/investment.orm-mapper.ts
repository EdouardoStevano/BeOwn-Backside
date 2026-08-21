import {
  Investment,
  type InvestmentNaissant,
  type InvestmentProjet,
} from 'src/subscription/domain/aggregates/investment';
import {
  Echeance,
  type EcheanceNaissante,
} from 'src/subscription/domain/entities/echeance';
import { InvestmentEntity } from '../entities/investment.entity';
import { EcheanceEntity } from '../entities/echeance.entity';

/**
 * Traduit entre les agrégats du domaine et les lignes TypeORM (§16).
 *
 * L'ORM rend les colonnes `decimal` en chaînes : c'est ici, et seulement ici,
 * que les `Number(...)` vivent — le domaine ne manipule que des nombres. Les
 * agrégats se reconstruisent depuis leur snapshot ; l'ancienne version posait
 * les champs un à un sur une instance vide, ce que l'état privé n'autorise
 * plus.
 */
export class InvestmentOrmMapper {
  static toDomain(entity: InvestmentEntity): Investment {
    return new Investment({
      id: entity.id,
      projetId: entity.projetId,
      utilisateurId: entity.utilisateurId,
      montant: Number(entity.montant),
      instrument: entity.instrument,
      nbTitres: entity.nbTitres,
      valeurTitre:
        entity.valeurTitre != null ? Number(entity.valeurTitre) : null,
      statut: entity.statut,
      delaiRetractationJusquAu: entity.delaiRetractationJusquAu,
      bulletinDocId: entity.bulletinDocId,
      signatureId: entity.signatureId,
      reservationId: entity.reservationId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      ...(entity.projet ? { projet: projetToDomain(entity.projet) } : {}),
    });
  }

  /** Une ligne prête à être insérée, pour un investissement qui vient de naître. */
  static naissantToEntity(naissant: InvestmentNaissant): InvestmentEntity {
    const entity = new InvestmentEntity();
    entity.projetId = naissant.projetId;
    entity.utilisateurId = naissant.utilisateurId;
    entity.montant = naissant.montant;
    entity.instrument = naissant.instrument;
    entity.nbTitres = naissant.nbTitres;
    entity.valeurTitre = naissant.valeurTitre;
    entity.statut = naissant.statut;
    entity.delaiRetractationJusquAu = naissant.delaiRetractationJusquAu;
    entity.bulletinDocId = naissant.bulletinDocId;
    entity.signatureId = naissant.signatureId;
    entity.reservationId = naissant.reservationId;
    return entity;
  }

  /** La ligne correspondant à un agrégat existant, identité comprise. */
  static toEntity(investment: Investment): InvestmentEntity {
    const etat = investment.snapshot();
    const entity = InvestmentOrmMapper.naissantToEntity(etat);
    entity.id = etat.id;
    return entity;
  }

  static echeanceToDomain(entity: EcheanceEntity): Echeance {
    return new Echeance({
      id: entity.id,
      investissementId: entity.investissementId,
      numero: entity.numero,
      datePrevue: entity.datePrevue,
      montantCapital: Number(entity.montantCapital),
      montantInterets: Number(entity.montantInterets),
      montantTotal: Number(entity.montantTotal),
      prelevementIR: Number(entity.prelevementIR ?? 0),
      prelevementCSG: Number(entity.prelevementCSG ?? 0),
      statut: entity.statut,
      payeLe: entity.payeLe,
      statutChangeLe: entity.statutChangeLe ?? null,
      rappelJ7Envoye: entity.rappelJ7Envoye ?? false,
      rappelJ1Envoye: entity.rappelJ1Envoye ?? false,
    });
  }

  /** Une ligne d'échéancier prête à être insérée. */
  static echeanceNaissanteToEntity(
    naissante: EcheanceNaissante,
  ): EcheanceEntity {
    const entity = new EcheanceEntity();
    entity.investissementId = naissante.investissementId;
    entity.numero = naissante.numero;
    entity.datePrevue = naissante.datePrevue;
    entity.montantCapital = naissante.montantCapital;
    entity.montantInterets = naissante.montantInterets;
    entity.montantTotal = naissante.montantTotal;
    entity.prelevementIR = naissante.prelevementIR;
    entity.prelevementCSG = naissante.prelevementCSG;
    entity.statut = naissante.statut;
    entity.payeLe = naissante.payeLe;
    entity.statutChangeLe = naissante.statutChangeLe;
    entity.rappelJ7Envoye = naissante.rappelJ7Envoye;
    entity.rappelJ1Envoye = naissante.rappelJ1Envoye;
    return entity;
  }

  static echeanceToEntity(echeance: Echeance): EcheanceEntity {
    const etat = echeance.snapshot();
    const entity = InvestmentOrmMapper.echeanceNaissanteToEntity(etat);
    entity.id = etat.id;
    return entity;
  }
}

const projetToDomain = (projet: {
  id: string;
  titre: string;
  ville: string | null;
  pays: string;
  type: string;
  triCible: number | null;
  dureeMois: number;
  prixFraction: number | null;
  nbFractions: number | null;
}): InvestmentProjet => ({
  id: projet.id,
  titre: projet.titre,
  ville: projet.ville,
  pays: projet.pays,
  type: projet.type,
  triCible: projet.triCible != null ? Number(projet.triCible) : null,
  dureeMois: projet.dureeMois,
  prixFraction:
    projet.prixFraction != null ? Number(projet.prixFraction) : null,
  nbFractions: projet.nbFractions,
});
