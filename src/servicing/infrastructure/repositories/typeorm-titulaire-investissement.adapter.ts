import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TitulaireInvestissementPort } from 'src/servicing/application/ports/titulaire-investissement.port';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';

/**
 * L'adaptateur du port `TitulaireInvestissementPort` : il lit la seule colonne
 * dont ce contexte a besoin dans la table des investissements.
 *
 * L'accès à la table d'un autre contexte est un écart d'infrastructure assumé,
 * de même nature que celui de `EcheanceEntity` vers `InvestmentEntity` — il
 * disparaîtra le jour où `subscription` publiera le titulaire avec le fait
 * `InvestmentSigned`. Ce qui compte est qu'il soit **ici** : un seul point à
 * remplacer, et rien au-dessus de cette classe ne sait d'où vient la réponse.
 */
@Injectable()
export class TypeOrmTitulaireInvestissementAdapter implements TitulaireInvestissementPort {
  constructor(
    @InjectRepository(InvestmentEntity)
    private readonly investissements: Repository<InvestmentEntity>,
  ) {}

  async titulaireDe(investissementId: string): Promise<number | null> {
    const ligne = await this.investissements.findOne({
      where: { id: investissementId },
      select: { id: true, utilisateurId: true },
    });

    return ligne ? ligne.utilisateurId : null;
  }
}
