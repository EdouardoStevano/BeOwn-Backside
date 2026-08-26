import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { CategoriePsfp } from 'src/compliance/domain/enums/categorie-psfp.enum';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import {
  ContactDu,
  EligibiliteDuTitulaire,
  ProfilConformiteQuery,
} from 'src/compliance/application/ports/profil-conformite.query';
import { InvestorComplianceProfileTypeOrmRepository } from './investor-compliance-profile.repository';
import { InvestorComplianceProfileEntity } from '../persistence/entities/investor-compliance-profile.entity';

/**
 * Lectures du dossier de conformité pour les contextes en aval.
 *
 * L'éligibilité passe par la **racine** plutôt que par une requête à plat, et
 * c'est délibéré : la catégorie et le plafond ne sont pas stockés, ils sont
 * calculés — `plafondConseille()` applique la formule PSFP au patrimoine du
 * questionnaire. Les recalculer ici en SQL les mettrait en double, exactement
 * ce que la copie sur `profil_pp` faisait (§3.3). Une lecture de plus contre
 * une règle en un seul exemplaire.
 *
 * La liste des contacts dus, elle, est une vraie projection : elle filtre des
 * colonnes, ne dérive rien, et n'a aucune raison de reconstruire une racine par
 * ligne (§11).
 */
@Injectable()
export class ProfilConformiteTypeOrmQuery implements ProfilConformiteQuery {
  constructor(
    private readonly profils: InvestorComplianceProfileTypeOrmRepository,
    @InjectRepository(InvestorComplianceProfileEntity)
    private readonly registre: Repository<InvestorComplianceProfileEntity>,
  ) {}

  async eligibilite(investorId: number): Promise<EligibiliteDuTitulaire> {
    const profil = await this.profils.findByInvestorId(investorId);
    const classement = profil.classement;

    return {
      investorId,
      // `classement` est `null` sans questionnaire ; son repli est le même que
      // celui d'`estNonAverti()` — non averti tant que rien n'est prouvé.
      categoriePsfp: classement?.categoriePsfp ?? CategoriePsfp.NON_AVERTI,
      estNonAverti: profil.estNonAverti(),
      plafondConseille: profil.plafondConseille(),
      patrimoineDeclare: classement?.patrimoineDeclare ?? null,
    };
  }

  async contactsDus(limite: number): Promise<ContactDu[]> {
    const lignes = await this.registre.find({
      where: [
        { prochainContactDu: LessThanOrEqual(new Date()) },
        {
          prochainContactDu: IsNull(),
          niveauRisque: NiveauRisque.VULNERABLE,
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
