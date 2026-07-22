import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogEntity } from '../infrastructure/persistences/entities/audit-log.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';
import { describeAuditAction } from './audit-description';

export interface AuditLogFilter {
  page?: number;
  limit?: number;
  acteurId?: string;
  action?: string;
  objetType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogItemDto {
  id: number;
  acteurId: string | null;
  acteurNom: string | null;
  acteurEmail: string | null;
  role: string | null;
  action: string;
  description: string;
  objetType: string | null;
  objetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogPage {
  items: AuditLogItemDto[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepo: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
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

    const [rows, total] = await qb.getManyAndCount();

    const acteurIds = [
      ...new Set(rows.map((r) => r.acteurId).filter((x): x is string => !!x)),
    ];
    const numIds = acteurIds.map((s) => Number(s)).filter((n) => Number.isInteger(n));
    const users = numIds.length
      ? await this.userRepo.find({ where: { userId: In(numIds) } })
      : [];
    const byId = new Map<string, { nom: string; email: string | null }>();
    for (const u of users) {
      const nom = `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim();
      const email = u.userEmail?.email ?? null;
      byId.set(String(u.userId), { nom: nom || email || '', email });
    }

    const items: AuditLogItemDto[] = rows.map((r) => {
      const u = r.acteurId ? byId.get(r.acteurId) : undefined;
      const statusCode =
        typeof r.metadata?.statusCode === 'number'
          ? (r.metadata.statusCode as number)
          : undefined;
      return {
        id: r.id,
        acteurId: r.acteurId,
        acteurNom: u?.nom || (r.acteurId ? `#${r.acteurId}` : null),
        acteurEmail: u?.email ?? null,
        role: r.role,
        action: r.action,
        description: describeAuditAction(r.action, r.objetType, statusCode),
        objetType: r.objetType,
        objetId: r.objetId,
        ip: r.ip,
        userAgent: r.userAgent,
        metadata: r.metadata,
        createdAt: r.createdAt,
      };
    });

    return { items, total, page, limit };
  }
}
