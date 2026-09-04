import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfilPPEntity } from '../infrastructure/persistences/entities/profil-pp.entity';
import { QuestionnaireAdequationEntity } from '../infrastructure/persistences/entities/questionnaire-adequation.entity';
import { ContactDu, PLAFOND_CONTACTS_DUS } from './models/contact-du';

@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  constructor(
    @InjectRepository(ProfilPPEntity)
    private readonly profilPPRepo: Repository<ProfilPPEntity>,
    @InjectRepository(QuestionnaireAdequationEntity)
    private readonly questionnaireRepo: Repository<QuestionnaireAdequationEntity>,
  ) {}

  /** Calcule et stocke le niveau de risque d'un investisseur. */
  async computeAndStore(userId: number): Promise<string> {
    const q = await this.questionnaireRepo.findOne({ where: { utilisateurId: userId } });
    const niveau = this.score(q);
    const next = this.nextContactDate(niveau);
    await this.profilPPRepo.update(
      { utilisateurId: userId },
      { niveauRisque: niveau, prochainContactDu: next },
    );
    return niveau;
  }

  private score(q: QuestionnaireAdequationEntity | null): string {
    if (!q) return 'vulnerable';
    if (q.resultCategorie === 'averti') return 'qualifie';
    // non averti — différencier par patrimoine net (art. 21(5))
    const patrimoine = Number(q.patrimoineNetCalcule ?? 0);
    if (patrimoine >= 100_000) return 'modere';
    return 'vulnerable';
  }

  private nextContactDate(niveau: string): Date {
    const next = new Date();
    const monthsAhead = niveau === 'vulnerable' ? 3 : niveau === 'modere' ? 6 : 12;
    next.setMonth(next.getMonth() + monthsAhead);
    return next;
  }

  /**
   * Investisseurs dont le prochain contact de suivi est dû.
   *
   * Rend un {@link ContactDu} — identité, adresse e-mail, date du dernier
   * contact — et NON l'entité de profil. Voir `models/contact-du.ts` pour ce
   * que la version précédente faisait fuiter.
   */
  async listDueContacts(): Promise<ContactDu[]> {
    const lignes = await this.profilPPRepo
      .createQueryBuilder('p')
      .leftJoin('p.utilisateur', 'u')
      .leftJoin('u.userEmail', 'e')
      .select('p.utilisateurId', 'utilisateurId')
      .addSelect('p.nom', 'nom')
      .addSelect('p.prenom', 'prenom')
      .addSelect('e.email', 'email')
      .addSelect('p.dernierContactAdmin', 'dernierContactAdmin')
      .where('p.prochainContactDu < :maintenant', { maintenant: new Date() })
      .orWhere(
        'p.prochainContactDu IS NULL AND p.niveauRisque = :niveauVulnerable',
        { niveauVulnerable: 'vulnerable' },
      )
      .orderBy('p.utilisateurId', 'ASC')
      .limit(PLAFOND_CONTACTS_DUS)
      .getRawMany<{
        utilisateurId: number | string;
        nom: string;
        prenom: string;
        email: string | null;
        dernierContactAdmin: Date | null;
      }>();

    return lignes.map((l) => ({
      utilisateurId: Number(l.utilisateurId),
      nom: l.nom,
      prenom: l.prenom,
      email: l.email ?? null,
      dernierContactAdmin: l.dernierContactAdmin ?? null,
    }));
  }

  /** CRON quotidien : recalcule les contacts dus. */
  @Cron('0 8 * * *')
  async dailyContactCheck(): Promise<void> {
    const due = await this.listDueContacts();
    this.logger.log(`Investisseurs à contacter : ${due.length}`);
  }
}
