import {
  Signature,
  type SignatureNaissante,
} from 'src/documents/domain/entities/signature';
import { SignatureEntity } from '../entities/signature.entity';

/**
 * Traduit entre l'entité de domaine et les lignes TypeORM (§16).
 *
 * `appliquerSur` mute la ligne chargée plutôt que d'en construire une neuve,
 * et c'est délibéré : le webhook relit la signature **sous verrou pessimiste**
 * dans sa transaction, et `save` doit écrire *cette* ligne-là.
 */
export class SignatureOrmMapper {
  static toDomain(entity: SignatureEntity): Signature {
    return new Signature({
      id: entity.id,
      youSignRequestId: entity.youSignRequestId,
      youSignSignerId: entity.youSignSignerId,
      youSignSigningUrl: entity.youSignSigningUrl,
      documentId: entity.documentId,
      investmentId: entity.investmentId,
      ordreId: entity.ordreId,
      nbFractions: entity.nbFractions,
      userId: entity.userId,
      statut: entity.statut,
      expiresAt: entity.expiresAt,
      signedAt: entity.signedAt,
      createdAt: entity.createdAt,
    });
  }

  /** Une ligne prête à être insérée, pour une demande qui vient d'être ouverte. */
  static naissanteToEntity(naissante: SignatureNaissante): SignatureEntity {
    const entity = new SignatureEntity();
    entity.youSignRequestId = naissante.youSignRequestId;
    entity.youSignSignerId = naissante.youSignSignerId;
    entity.youSignSigningUrl = naissante.youSignSigningUrl;
    entity.documentId = naissante.documentId;
    entity.investmentId = naissante.investmentId;
    entity.ordreId = naissante.ordreId;
    entity.nbFractions = naissante.nbFractions;
    entity.userId = naissante.userId;
    entity.statut = naissante.statut;
    entity.expiresAt = naissante.expiresAt;
    entity.signedAt = naissante.signedAt;
    return entity;
  }

  /** Reporte l'état d'une entité de domaine sur la ligne dont elle provient. */
  static appliquerSur(
    entity: SignatureEntity,
    signature: Signature,
  ): SignatureEntity {
    const etat = signature.snapshot();
    entity.statut = etat.statut;
    entity.signedAt = etat.signedAt;
    return entity;
  }
}
