import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EcheanceEntity } from 'src/servicing/infrastructure/persistence/entities/echeance.entity';
import { EcheanceOrmMapper } from 'src/servicing/infrastructure/persistence/mappers/echeance.orm-mapper';
import {
  AucunInvestissementSurLeProjetError,
  NumeroDEcheanceIntrouvableError,
  NumeroDEcheanceNonSupprimableError,
} from 'src/servicing/domain/errors';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';

/**
 * **Retirer un numéro de l'échéancier d'un projet** — l'échéance N disparaît
 * chez tous les investisseurs, et les suivantes se décalent pour combler le
 * trou.
 *
 * L'opération est un lot, et son invariant porte sur **l'ensemble** des
 * échéances du numéro : on ne retire que si aucune n'a bougé. Une seule
 * vérifiée ou payée, et la renumérotation décalerait un calendrier déjà engagé
 * — un investisseur verrait son échéance 5 devenir 4 après avoir été réglée.
 *
 * C'est pour cela que la garde n'est pas dans `Echeance` : elle ne se juge pas
 * ligne à ligne. `assertSupprimable()` protège chaque échéance, ce use case
 * protège la série.
 *
 * La renumérotation reste un `UPDATE ... SET numero = numero - 1` : décaler
 * quelques centaines de lignes une par une à travers le domaine n'apporterait
 * rien — aucune règle ne s'applique au décalage lui-même, seulement à
 * l'autorisation de le faire.
 */
@Injectable()
export class SupprimerNumeroEcheanceUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeances: Repository<EcheanceEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investissements: Repository<InvestmentEntity>,
  ) {}

  async execute(
    projetId: string,
    numero: number,
  ): Promise<{ deleted: number; renumbered: number }> {
    const investissements = await this.investissements.find({
      where: { projetId },
    });
    if (investissements.length === 0) {
      throw new AucunInvestissementSurLeProjetError(projetId);
    }
    const investissementIds = investissements.map((i) => i.id);

    const lignes = await this.echeances.find({
      where: { investissementId: In(investissementIds), numero },
    });
    if (lignes.length === 0) {
      throw new NumeroDEcheanceIntrouvableError(numero);
    }

    // L'invariant de la série : aucune échéance du numéro ne doit avoir bougé.
    if (lignes.some((l) => !EcheanceOrmMapper.toDomain(l).estAVenir)) {
      throw new NumeroDEcheanceNonSupprimableError();
    }

    const supprimees = await this.echeances.delete({
      id: In(lignes.map((l) => l.id)),
    });

    const decalees = await this.echeances
      .createQueryBuilder()
      .update(EcheanceEntity)
      .set({ numero: () => '"numero" - 1' })
      .where('"investissementId" IN (:...ids)', { ids: investissementIds })
      .andWhere('"numero" > :n', { n: numero })
      .execute();

    return {
      deleted: supprimees.affected ?? 0,
      renumbered: decalees.affected ?? 0,
    };
  }
}
