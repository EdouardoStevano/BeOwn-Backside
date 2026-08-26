import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NiveauRisque } from 'src/compliance/domain/enums/niveau-risque.enum';
import {
  PROFIL_PP_REPOSITORY,
  type ProfilPPRepository,
} from 'src/compliance/domain/repositories/profil-pp.repository';
import {
  INVESTOR_COMPLIANCE_PROFILE_REPOSITORY,
  type InvestorComplianceProfileRepository,
} from 'src/compliance/domain/repositories/investor-compliance-profile.repository';
import { ProfilPP } from 'src/compliance/domain/aggregates/profil-pp';
import { prochainContactApres } from 'src/compliance/domain/domain-services/suivi-investisseur.domain-service';

/** Au-delà, la liste n'est plus exploitable à la main : elle est paginée côté admin. */
const MAX_CONTACTS_DUS = 500;

/**
 * Surveillance périodique de la clientèle : à quel rythme reprendre la relation
 * avec chaque investisseur, et qui est à contacter maintenant.
 *
 * Le service ne porte plus aucune règle. Le **niveau de risque** est déduit des
 * réponses par `AdequacyAssessment.niveauRisque()` — il comparait ici
 * `resultCategorie` à des chaînes nues — et la **cadence de contact** par
 * `prochainContactApres`, où le niveau inconnu ne retombe plus silencieusement
 * sur le suivi le plus lâche. Il ne reste ici que l'orchestration : lire,
 * demander au domaine, écrire.
 *
 * Il n'injecte plus de `Repository` TypeORM : une classe de `applications/` ne
 * connaît que des ports (§12.3).
 */
@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  constructor(
    @Inject(PROFIL_PP_REPOSITORY)
    private readonly profilPPRepository: ProfilPPRepository,
    @Inject(INVESTOR_COMPLIANCE_PROFILE_REPOSITORY)
    private readonly profils: InvestorComplianceProfileRepository,
  ) {}

  /**
   * Calcule et stocke le niveau de risque d'un investisseur.
   *
   * Sans questionnaire, le titulaire est traité comme vulnérable : c'est le
   * suivi le plus rapproché, et se tromper dans ce sens ne coûte qu'un contact
   * de trop.
   */
  async computeAndStore(userId: number): Promise<NiveauRisque> {
    const profil = await this.profils.findByInvestorId(userId);
    // `niveauSuivi()` est le niveau que les réponses appellent : la racine le
    // demande à la pièce qui le calcule, sans la rendre.
    const niveauRisque = profil.niveauSuivi() ?? NiveauRisque.VULNERABLE;

    await this.profilPPRepository.enregistrerSuiviRisque(userId, {
      niveauRisque,
      prochainContactDu: prochainContactApres(niveauRisque),
    });

    return niveauRisque;
  }

  /** Liste les investisseurs dont le prochain contact est dû (export Excel/CSV). */
  listDueContacts(): Promise<ProfilPP[]> {
    return this.profilPPRepository.listerContactsDus(MAX_CONTACTS_DUS);
  }

  /** CRON quotidien : recalcule les contacts dus. */
  @Cron('0 8 * * *')
  async dailyContactCheck(): Promise<void> {
    const due = await this.listDueContacts();
    this.logger.log(`Investisseurs à contacter : ${due.length}`);
  }
}
