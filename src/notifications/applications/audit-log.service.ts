import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../infrastructure/persistences/entities/audit-log.entity';

export interface AuditLogFilter {
  page?: number;
  limit?: number;
  acteurId?: string;
  action?: string;
  objetType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogPage {
  items: AuditLogEntity[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
  ) {}

  async create(
    acteurId: string,
    role: string,
    action: string,
    objetType?: string,
    objetId?: string,
    ip?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>,
  ): Promise<AuditLogEntity> {
    const log = this.auditLogRepo.create({
      acteurId,
      role,
      action,
      objetType,
      objetId,
      ip,
      userAgent,
      metadata,
    });
    return this.auditLogRepo.save(log);
  }

  /**
   * Journal d'activité paginé et filtrable — contrat consommé par le
   * back-office (GET /audit-logs). Restreint via @RequirePermission('audit:read')
   * sur le contrôleur.
   */
  async findFiltered(filter: AuditLogFilter): Promise<AuditLogPage> {
    // Number(...) || défaut : neutralise aussi NaN (ex. ?page=abc).
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 50));

    const qb = this.auditLogRepo.createQueryBuilder('log');

    if (filter.acteurId) {
      qb.andWhere('log.acteurId = :acteurId', { acteurId: filter.acteurId });
    }
    if (filter.action) {
      qb.andWhere('log.action ILIKE :action', { action: `${filter.action}%` });
    }
    if (filter.objetType) {
      qb.andWhere('log.objetType = :objetType', { objetType: filter.objetType });
    }
    if (filter.dateFrom) {
      qb.andWhere('log.createdAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: filter.dateTo });
    }

    qb.orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
