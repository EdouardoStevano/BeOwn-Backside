import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { NiveauRisque } from 'src/adequacy/domain/enums/niveau-risque.enum';
import type {
  ContactDu,
  SuiviDesInvestisseursQuery,
} from 'src/adequacy/application/ports/suivi-des-investisseurs.query';
import { EvaluationAdequationEntity } from '../persistence/entities/evaluation-adequation.entity';

/**
 * La campagne de contact périodique, lue à plat.
 *
 * Contrairement au classement, rien n'est dérivé ici : la requête filtre des
 * colonnes et rend des lignes. Reconstruire une racine par titulaire pour lire
 * trois dates serait du travail pur perte (§11).
 *
 * Le niveau de risque vit sur la table de l'évaluation, où il a suivi le
 * questionnaire dont il découle.
 */
@Injectable()
export class SuiviDesInvestisseursTypeOrmQuery implements SuiviDesInvestisseursQuery {
  constructor(
    @InjectRepository(EvaluationAdequationEntity)
    private readonly surveillance: Repository<EvaluationAdequationEntity>,
  ) {}

  async contactsDus(limite: number): Promise<ContactDu[]> {
    const lignes = await this.surveillance.find({
      where: [
        {
          prochainContactDu: LessThanOrEqual(new Date()),
          // Le contact périodique vise une personne joignable, pas une
          // société : seules les lignes du titulaire entrent dans la campagne.
          souscripteurSocieteId: IsNull(),
        },
        {
          prochainContactDu: IsNull(),
          niveauRisque: NiveauRisque.VULNERABLE,
          souscripteurSocieteId: IsNull(),
        },
      ],
      order: { prochainContactDu: 'ASC' },
      take: limite,
    });

    return lignes.map((ligne) => ({
      investorId: ligne.userId,
      niveauRisque: ligne.niveauRisque,
      dernierContactAdmin: ligne.dernierContactAdmin,
      prochainContactDu: ligne.prochainContactDu,
    }));
  }
}
