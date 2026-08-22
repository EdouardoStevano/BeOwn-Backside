import {
  Echeance,
  type EcheanceNaissante,
} from 'src/servicing/domain/entities/echeance';
import { EcheanceEntity } from '../entities/echeance.entity';

/**
 * Traduit entre les échéances du domaine et les lignes TypeORM (§16).
 *
 * L'ORM rend les colonnes `decimal` en chaînes : c'est ici, et seulement ici,
 * que les `Number(...)` vivent — le domaine ne manipule que des nombres.
 *
 * Ces trois méthodes étaient des membres statiques de `InvestmentOrmMapper`,
 * dans `subscription` : un mapper d'agrégat qui savait aussi traduire les
 * lignes d'un autre contexte. Chaque contexte traduit désormais ses propres
 * tables.
 */
export class EcheanceOrmMapper {
  static toDomain(entity: EcheanceEntity): Echeance {
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
  static naissanteToEntity(naissante: EcheanceNaissante): EcheanceEntity {
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

  /** La ligne correspondant à une échéance existante, identité comprise. */
  static toEntity(echeance: Echeance): EcheanceEntity {
    const etat = echeance.snapshot();
    const entity = EcheanceOrmMapper.naissanteToEntity(etat);
    entity.id = etat.id;
    return entity;
  }
}
