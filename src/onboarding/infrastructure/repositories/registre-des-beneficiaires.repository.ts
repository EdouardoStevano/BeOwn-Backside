import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistreDesBeneficiaires } from 'src/onboarding/domain/aggregates/registre-des-beneficiaires';
import { RegistreDesBeneficiairesRepository } from 'src/onboarding/domain/repositories/registre-des-beneficiaires.repository';
import { BeneficiaireEffectifEntity } from '../persistence/entities/beneficiaire-effectif.entity';
import { BeneficiaireEffectifOrmMapper } from '../persistence/mappers/beneficiaire-effectif.mapper';

/**
 * Le registre des bénéficiaires d'une société, composé depuis sa table.
 *
 * `parSociete` rend **toujours** un registre : une société sans déclaration en
 * a un vide. C'est l'état de départ du parcours, et le traduire ici plutôt que
 * chez chaque appelant évite qu'un `null` oublié fasse passer un registre vide
 * pour rempli.
 */
@Injectable()
export class RegistreDesBeneficiairesTypeOrmRepository implements RegistreDesBeneficiairesRepository {
  constructor(
    @InjectRepository(BeneficiaireEffectifEntity)
    private readonly beneficiaires: Repository<BeneficiaireEffectifEntity>,
  ) {}

  async parSociete(societeId: string): Promise<RegistreDesBeneficiaires> {
    const lignes = await this.beneficiaires.find({
      where: { profilPMId: societeId },
      order: { createdAt: 'ASC' },
    });

    return new RegistreDesBeneficiaires({
      societeId,
      beneficiaires: lignes.map((ligne) =>
        BeneficiaireEffectifOrmMapper.toDomain(ligne),
      ),
    });
  }

  /**
   * Enregistre le registre d'un bloc.
   *
   * Relu après écriture : les identités attribuées en base doivent revenir dans
   * l'agrégat, sans quoi l'appelant publierait des déclarations sans `id` — et
   * le retrait suivant ne saurait pas laquelle viser.
   */
  async save(
    registre: RegistreDesBeneficiaires,
  ): Promise<RegistreDesBeneficiaires> {
    const entities = registre.beneficiaires.map((beneficiaire) =>
      BeneficiaireEffectifOrmMapper.toEntity(beneficiaire, registre.societeId),
    );

    if (entities.length > 0) await this.beneficiaires.save(entities);

    return this.parSociete(registre.societeId);
  }

  /**
   * `profilPMId` reste dans le critère bien que la racine ait déjà vérifié
   * l'appartenance : une garde en base coûte une condition et couvre le jour
   * où un appelant oublierait de passer par elle.
   */
  async retirer(societeId: string, beneficiaireId: string): Promise<void> {
    await this.beneficiaires.delete({
      id: beneficiaireId,
      profilPMId: societeId,
    });
  }
}
