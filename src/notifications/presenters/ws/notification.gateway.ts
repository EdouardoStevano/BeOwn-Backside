import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationEntity } from '../../infrastructure/persistences/entities/notification.entity';

@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      process.env.ADMIN_URL ?? 'http://localhost:5174',
    ],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          'Bearer ',
          '',
        );

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Garde anti-confusion de token : la vérification ci-dessus est
      // secret-only (pas d'audience), donc les tokens typés signés avec le
      // même secret (`email_verify`, `password_reset`, `notif_unsubscribe`)
      // passeraient et permettraient de s'abonner à `user-<victimId>`. Les
      // access tokens légitimes ne portent jamais de claim `type` : tout
      // token qui en porte un est refusé.
      if (payload.type) {
        client.disconnect();
        return;
      }

      const userId: number = payload.sub ?? payload.userId ?? payload.id;
      client.data.userId = userId;
      await client.join(`user-${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // cleanup handled automatically by socket.io room leave
    void client;
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() _data: unknown) {
    client.emit('pong');
  }

  sendToUser(userId: number, notification: NotificationEntity) {
    this.server.to(`user-${userId}`).emit('notification', {
      id: notification.id,
      type: notification.type,
      titre: notification.titre,
      message: notification.message,
      lu: notification.lu,
      createdAt: notification.createdAt,
      metadata: notification.metadata,
    });
  }

  sendUnreadCount(userId: number, count: number) {
    this.server.to(`user-${userId}`).emit('unread_count', { count });
  }
}
