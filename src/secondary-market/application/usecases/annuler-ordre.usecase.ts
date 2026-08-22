import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { OrdreMarcheOrmMapper } from 'src/secondary-market/infrastructure/persistence/mappers/ordre-marche.orm-mapper';
import { OrdreIntrouvableError } from 'src/secondary-market/domain/errors';

/**
 * **Annuler un ordre** — le vendeur retire son annonce du carnet.
 *
 * Le use case orchestre, il ne décide pas (§14) : qui a le droit de retirer
 * l'annonce et depuis quel état elle se retire appartiennent à
 * `SecondaryMarketOrder.annuler`. Le contrôleur les portait en deux `if`, et
 * posait le statut à la main — `ordre.statut = ANNULE`, c'est-à-dire une
 * transition d'agrégat écrite depuis l'extérieur (§6).
 *
 * Aucune transaction : l'annulation ne touche qu'une ligne, ne libère aucun
 * fonds, et ne se dispute avec personne — les fractions redeviennent
 * disponibles par le simple fait que l'ordre quitte `EN_CARNET`, ce que la
 * capacité de cession recompte à la prochaine annonce.
 */
@Injectable()
export class AnnulerOrdreUseCase {
  constructor(
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
  ) {}

  async execute(
    ordreId: string,
    vendeurId: number,
  ): Promise<OrdreMarcheEntity> {
    const ligne = await this.ordreRepo.findOne({ where: { id: ordreId } });
    if (!ligne) throw new OrdreIntrouvableError(ordreId);

    const ordre = OrdreMarcheOrmMapper.toDomain(ligne);
    ordre.annuler(vendeurId);

    return this.ordreRepo.save(OrdreMarcheOrmMapper.appliquerSur(ligne, ordre));
  }
}
