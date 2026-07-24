import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { ProfilPPEntity } from '../infrastructure/persistences/entities/profil-pp.entity';
import { QuestionnaireAdequationEntity } from '../infrastructure/persistences/entities/questionnaire-adequation.entity';

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
    if (q.resultCategorie === 'professionnel') return 'qualifie';
    if (q.resultCategorie === 'averti') return 'modere';
    // non_averti — différencier par patrimoine
    const patrimoine = Number(q.patrimoineNet ?? 0);
    if (patrimoine >= 100_000) return 'modere';
    return 'vulnerable';
  }

  private nextContactDate(niveau: string): Date {
    const next = new Date();
    const monthsAhead = niveau === 'vulnerable' ? 3 : niveau === 'modere' ? 6 : 12;
    next.setMonth(next.getMonth() + monthsAhead);
    return next;
  }

  /** Liste les investisseurs dont le prochain contact est dû (export Excel/CSV). */
  async listDueContacts(): Promise<ProfilPPEntity[]> {
    return this.profilPPRepo.find({
      where: [
        { prochainContactDu: LessThan(new Date()) },
        { prochainContactDu: IsNull(), niveauRisque: 'vulnerable' },
      ],
      take: 500,
    });
  }

  /** CRON quotidien : recalcule les contacts dus. */
  @Cron('0 8 * * *')
  async dailyContactCheck(): Promise<void> {
    const due = await this.listDueContacts();
    this.logger.log(`Investisseurs à contacter : ${due.length}`);
  }
}
