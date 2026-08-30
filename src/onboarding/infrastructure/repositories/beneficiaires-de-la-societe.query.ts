import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BeneficiaireDeclare,
  BeneficiairesDeLaSocieteQuery,
} from 'src/onboarding/application/ports/beneficiaires-de-la-societe.query';
import { BeneficiaireEffectifEntity } from '../persistence/entities/beneficiaire-effectif.entity';

/**
 * Projection des bénéficiaires effectifs d'une société.
 *
 * Une vraie Query au sens du §11 : elle filtre des colonnes, ne dérive rien, et
 * n'a aucune raison de reconstruire un agrégat par ligne. Elle ne rend que les
 * trois champs dont le dossier de pièces a besoin.
 */
@Injectable()
export class BeneficiairesDeLaSocieteTypeOrmQuery implements BeneficiairesDeLaSocieteQuery {
  constructor(
    @InjectRepository(BeneficiaireEffectifEntity)
    private readonly beneficiaires: Repository<BeneficiaireEffectifEntity>,
  ) {}

  async parSociete(societeId: string): Promise<BeneficiaireDeclare[]> {
    const lignes = await this.beneficiaires.find({
      where: { profilPMId: societeId },
      select: ['id', 'prenom', 'nom'],
      order: { createdAt: 'ASC' },
    });

    return lignes.map((ligne) => ({
      id: ligne.id,
      prenom: ligne.prenom,
      nom: ligne.nom,
    }));
  }
}
