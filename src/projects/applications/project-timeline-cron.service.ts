import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { ProjectEntity } from '../infrastructure/persistences/entities/project.entity';
import { ProjectStatus } from '../domains/enums/project-status.enum';
import { computeChronologieStatuts } from './chronologie-status';

@Injectable()
export class ProjectTimelineCronService {
  private readonly logger = new Logger(ProjectTimelineCronService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  /** Avance quotidiennement les étapes de chronologie selon leur date. */
  @Cron('0 6 * * *')
  async advanceTimelines(): Promise<void> {
    const today = new Date();
    const projects = await this.projectRepo.find({
      where: {
        statut: Not(
          In([ProjectStatus.ANNULE, ProjectStatus.CLOTURE, ProjectStatus.ECHEC]),
        ),
      },
    });
    let updated = 0;
    for (const p of projects) {
      const current = Array.isArray(p.chronologie) ? p.chronologie : [];
      if (current.length === 0) continue;
      const next = computeChronologieStatuts(current, today);
      const changed = next.some((e, i) => e.statut !== current[i]?.statut);
      if (changed) {
        await this.projectRepo.update({ id: p.id }, { chronologie: next });
        updated++;
      }
    }
    this.logger.log(`CRON chronologie: ${updated} projet(s) mis à jour`);
  }
}
