import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  NotificationEntity,
  NotificationCanal,
  NotificationType,
} from '../infrastructure/persistences/entities/notification.entity';
import { NotificationGateway } from '../presenters/ws/notification.gateway';
import { UserEntity, UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

export interface PushNotificationOptions {
  utilisateurId: number;
  type: NotificationType;
  titre: string;
  message: string;
  canal?: NotificationCanal;
  templateCode?: string;
  metadata?: Record<string, unknown>;
}

export interface PushAdminNotificationOptions {
  type: NotificationType;
  titre: string;
  message: string;
  roles?: UserRole[];
  canal?: NotificationCanal;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,
  ) {}

  async push(opts: PushNotificationOptions): Promise<NotificationEntity> {
    const notification = this.notificationRepo.create({
      utilisateurId: opts.utilisateurId,
      canal: opts.canal ?? NotificationCanal.IN_APP,
      type: opts.type,
      titre: opts.titre,
      message: opts.message,
      lu: false,
      templateCode: opts.templateCode ?? null,
      statut: 'envoye',
      envoyeLe: new Date(),
      metadata: opts.metadata ?? null,
    });
    const saved = await this.notificationRepo.save(notification);

    // Broadcast via WebSocket
    try {
      this.gateway.sendToUser(opts.utilisateurId, saved);
      const unread = await this.countUnread(opts.utilisateurId);
      this.gateway.sendUnreadCount(opts.utilisateurId, unread);
    } catch {
      // WebSocket delivery failure is non-blocking
    }

    return saved;
  }

  /** Legacy create — kept for backward compatibility */
  async create(
    utilisateurId: number,
    canal: NotificationCanal,
    templateCode: string,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationEntity> {
    return this.push({
      utilisateurId,
      canal,
      type: NotificationType.AUTRE,
      titre: templateCode,
      message: '',
      templateCode,
      metadata,
    });
  }

  async findByUserId(userId: number): Promise<NotificationEntity[]> {
    return this.notificationRepo.find({
      where: { utilisateurId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: string): Promise<void> {
    await this.notificationRepo.update(id, { lu: true, statut: 'lu' });
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepo.update(
      { utilisateurId: userId, lu: false },
      { lu: true, statut: 'lu' },
    );
    this.gateway.sendUnreadCount(userId, 0);
  }

  async countUnread(userId: number): Promise<number> {
    return this.notificationRepo.count({
      where: { utilisateurId: userId, lu: false },
    });
  }

  async markAsSent(id: string): Promise<void> {
    await this.notificationRepo.update(id, {
      statut: 'envoye',
      envoyeLe: new Date(),
    });
  }

  async deleteOne(id: string, userId: number): Promise<{ deleted: boolean }> {
    // Constrain by utilisateurId so a user can only delete their own notifs.
    const res = await this.notificationRepo.delete({ id, utilisateurId: userId });
    const deleted = (res.affected ?? 0) > 0;
    if (deleted) {
      const unread = await this.countUnread(userId);
      this.gateway.sendUnreadCount(userId, unread);
    }
    return { deleted };
  }

  async deleteAll(userId: number): Promise<{ deletedCount: number }> {
    const res = await this.notificationRepo.delete({ utilisateurId: userId });
    this.gateway.sendUnreadCount(userId, 0);
    return { deletedCount: res.affected ?? 0 };
  }

  /**
   * Pousse une notification à tous les utilisateurs portant l'un des rôles passés.
   * Une notification par destinataire — broadcast en temps réel via WebSocket.
   */
  async pushToRoles(
    opts: PushAdminNotificationOptions,
  ): Promise<NotificationEntity[]> {
    const roles = opts.roles ?? [
      UserRole.ADMIN,
      UserRole.SUPPORT,
      UserRole.COMPLIANCE,
      UserRole.FINANCIER,
      UserRole.RCCI,
    ];

    const recipients = await this.userRepo.find({
      where: { role: In(roles) },
      select: ['userId'],
    });
    if (recipients.length === 0) return [];

    return Promise.all(
      recipients.map((r) =>
        this.push({
          utilisateurId: r.userId,
          type: opts.type,
          titre: opts.titre,
          message: opts.message,
          canal: opts.canal,
          metadata: opts.metadata,
        }),
      ),
    );
  }

  /** Alias historique — conservé pour compatibilité. */
  pushToAdmins(
    opts: PushAdminNotificationOptions,
  ): Promise<NotificationEntity[]> {
    return this.pushToRoles(opts);
  }

  /** Broadcast à tous les investisseurs actifs (PP + PM). */
  pushToInvestors(
    opts: Omit<PushAdminNotificationOptions, 'roles'>,
  ): Promise<NotificationEntity[]> {
    return this.pushToRoles({ ...opts, roles: [UserRole.INVESTISSEUR] });
  }
}
