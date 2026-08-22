import {
  SecondaryMarketOrder,
  type SecondaryMarketOrderNaissant,
} from 'src/secondary-market/domain/aggregates/secondary-market-order';
import { OrdreMarcheEntity } from '../entities/ordre-marche.entity';

/**
 * Traduit entre l'agrégat du domaine et les lignes TypeORM (§16).
 *
 * L'ORM rend les colonnes `decimal` en chaînes : c'est ici, et seulement ici,
 * que les `Number(...)` vivent — le domaine ne manipule que des nombres. Le
 * contrôleur les semait sur chaque lecture (`Number(ordre.prixUnitaire)`,
 * `Number(o.nbFractions)`), ce qui rendait chaque calcul dépendant de la
 * façon dont la ligne avait été chargée.
 *
 * Le nom de l'entité reste `OrdreMarcheEntity` : elle porte la table
 * `ordre_marche`, et le modèle de persistance n'a pas à suivre le nom du
 * modèle de domaine (§16).
 */
export class OrdreMarcheOrmMapper {
  static toDomain(entity: OrdreMarcheEntity): SecondaryMarketOrder {
    return new SecondaryMarketOrder({
      id: entity.id,
      investissementId: entity.investissementId,
      vendeurId: entity.vendeurId,
      acheteurId: entity.acheteurId,
      sens: entity.sens,
      nbFractions: Number(entity.nbFractions),
      prixUnitaire: Number(entity.prixUnitaire),
      montant: Number(entity.montant),
      statut: entity.statut,
      valideJusquAu: entity.valideJusquAu,
      createdAt: entity.createdAt,
    });
  }

  /** Une ligne prête à être insérée, pour un ordre qui vient d'être passé. */
  static naissantToEntity(
    naissant: SecondaryMarketOrderNaissant,
  ): OrdreMarcheEntity {
    const entity = new OrdreMarcheEntity();
    entity.investissementId = naissant.investissementId;
    entity.vendeurId = naissant.vendeurId;
    entity.acheteurId = naissant.acheteurId;
    entity.sens = naissant.sens;
    entity.nbFractions = naissant.nbFractions;
    entity.prixUnitaire = naissant.prixUnitaire;
    entity.montant = naissant.montant;
    entity.statut = naissant.statut;
    entity.valideJusquAu = naissant.valideJusquAu;
    return entity;
  }

  /**
   * Reporte l'état d'un agrégat sur la ligne dont il provient.
   *
   * Muter la ligne chargée plutôt que d'en construire une neuve est
   * délibéré : les use cases la relisent sous verrou pessimiste, et `save`
   * doit écrire *cette* ligne-là, avec ses relations déjà résolues.
   */
  static appliquerSur(
    entity: OrdreMarcheEntity,
    ordre: SecondaryMarketOrder,
  ): OrdreMarcheEntity {
    const etat = ordre.snapshot();
    entity.acheteurId = etat.acheteurId;
    entity.nbFractions = etat.nbFractions;
    entity.montant = etat.montant;
    entity.statut = etat.statut;
    return entity;
  }
}
