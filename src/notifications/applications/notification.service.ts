import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationEntity,
  NotificationCanal,
} from '../infrastructure/persistences/entities/notification.entity';
import { UserEntity } from 'src/users/infrastructure/persistences/entities/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  async create(
    utilisateurId: number,
    canal: NotificationCanal,
    templateCode: string,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationEntity> {
    const notification = this.notificationRepo.create({
      utilisateurId,
      canal,
      templateCode,
      statut: 'en_attente',
      metadata,
      envoyeLe: null,
    });
    return this.notificationRepo.save(notification);
  }

  async markAsSent(id: string): Promise<void> {
    await this.notificationRepo.update(id, {
      statut: 'envoye',
      envoyeLe: new Date(),
    });
  }

  async findByUserId(userId: number): Promise<NotificationEntity[]> {
    return this.notificationRepo.find({
      where: { utilisateurId: userId },
      order: { envoyeLe: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: string): Promise<void> {
    await this.notificationRepo.update(id, { statut: 'lu' });
  }
}
