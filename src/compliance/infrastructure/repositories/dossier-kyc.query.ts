import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycCaseSnapshot } from 'src/compliance/domain/entities/kyc-case';
import { DossierKycQuery } from 'src/compliance/application/ports/dossier-kyc.query';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { KycOrmMapper } from '../persistence/mappers/kyc.mapper';

/**
 * Lecture des dossiers de vérification pour l'affichage.
 *
 * Il passe par `KycOrmMapper.toDomain(...).toJSON()` plutôt que de recopier la
 * ligne ORM : le mapper est le seul endroit qui sache normaliser ce que rend le
 * driver — une date `date` en chaîne, un `decimal` en chaîne — et le dupliquer
 * ici ferait diverger le JSON des routes de lecture de celui des routes
 * d'écriture. Le détour par l'entité ne dure que le temps de l'instantané :
 * rien de vivant ne franchit ce port.
 */
@Injectable()
export class DossierKycTypeOrmQuery implements DossierKycQuery {
  constructor(
    @InjectRepository(KycEntity)
    private readonly kycRepo: Repository<KycEntity>,
  ) {}

  async parTitulaire(utilisateurId: number): Promise<KycCaseSnapshot | null> {
    const entity = await this.kycRepo.findOne({ where: { utilisateurId } });
    return entity ? KycOrmMapper.toDomain(entity).toJSON() : null;
  }

  async lister(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: KycCaseSnapshot[]; total: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));

    // Aucune jointure vers `users` : le dossier ne rend que ce dont il est
    // propriétaire. Le titulaire est ajouté par `GetKycUseCase.executeAll`, via
    // le port d'IAM.
    const [entities, total] = await this.kycRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: entities.map((e) => KycOrmMapper.toDomain(e).toJSON()),
      total,
    };
  }
}
