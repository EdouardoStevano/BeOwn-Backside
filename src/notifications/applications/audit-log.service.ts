import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../infrastructures/persistences/entities/audit-log.entity';

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

  async findByActor(actorId: string): Promise<AuditLogEntity[]> {
    return this.auditLogRepo.find({
      where: { acteurId: actorId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByObjectType(objetType: string): Promise<AuditLogEntity[]> {
    return this.auditLogRepo.find({
      where: { objetType: objetType },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findAll(limit: number = 100): Promise<AuditLogEntity[]> {
    return this.auditLogRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
