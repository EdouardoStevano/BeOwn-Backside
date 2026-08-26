import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DossierKycPublie,
  DossierKycQuery,
} from 'src/compliance/application/ports/dossier-kyc.query';
import { KycEntity } from '../persistence/entities/kyc.entity';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';
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
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly racines: Repository<InvestorComplianceProfileEntity>,
  ) {}

  async parTitulaire(utilisateurId: number): Promise<DossierKycPublie | null> {
    // Deux lectures et non une jointure : le dossier ne porte plus le compte,
    // c'est la racine qui fait le lien — et elle se lit par un index unique.
    const racine = await this.racines.findOne({
      where: { userId: utilisateurId },
    });
    if (!racine) return null;

    const entity = await this.kycRepo.findOne({
      where: { profileId: racine.id },
    });
    if (!entity) return null;

    return {
      ...KycOrmMapper.toDomain(entity).toJSON(),
      investorId: utilisateurId,
    };
  }

  async lister(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: DossierKycPublie[]; total: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 20));

    // Jointure vers la racine, et vers elle seule : c'est elle qui sait de
    // quel titulaire il s'agit. Le nom, lui, est composé au-dessus par le port
    // d'IAM (`GetKycUseCase.executeAll`) — ce contexte ne joint jamais `users`.
    const [lignes, total] = await this.kycRepo
      .createQueryBuilder('kyc')
      .innerJoin(
        InvestorComplianceProfileEntity,
        'racine',
        'racine.id = kyc."profileId"',
      )
      .addSelect('racine."userId"', 'investorId')
      .orderBy('kyc.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities()
      .then(
        async ({ entities, raw }) =>
          [
            entities.map((e, i) => ({
              ...KycOrmMapper.toDomain(e).toJSON(),
              investorId: Number((raw[i] as { investorId: number }).investorId),
            })),
            await this.kycRepo.count(),
          ] as [DossierKycPublie[], number],
      );

    return { items: lignes, total };
  }
}
