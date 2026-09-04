import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from 'src/iam/applications/services/token/token.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import { NotificationEntity } from '../../infrastructure/persistences/entities/notification.entity';

/**
 * Origines autorisées à ouvrir le canal temps réel.
 *
 * CONTRAINTE : le décorateur `@WebSocketGateway` est évalué au CHARGEMENT DU
 * MODULE, c'est-à-dire avant que la configuration de l'application soit lue.
 * Un tableau littéral `[process.env.FRONTEND_URL ?? …]` y était donc figé sur
 * les valeurs de repli — en production, la CORS du WebSocket pouvait n'autoriser
 * que `localhost`, et le canal de notifications ne s'ouvrait jamais.
 *
 * Le contournement ne consiste PAS à charger la configuration plus tôt (cela
 * imposerait de toucher l'amorçage, hors périmètre) mais à ne rien figer : une
 * FONCTION d'origine est appelée par socket.io à CHAQUE POIGNÉE DE MAIN, donc
 * bien après l'amorçage. `process.env` y est alors renseigné, quelle que soit
 * l'ordre d'évaluation des modules.
 *
 * Effet de bord voulu : modifier `FRONTEND_URL` prend effet à la connexion
 * suivante, sans redémarrage.
 */
const originesAutorisees = (): string[] => [
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
  process.env.ADMIN_URL ?? 'http://localhost:5174',
];

/**
 * Vérification d'origine évaluée à l'exécution. Une requête sans en-tête
 * `Origin` (client natif, sonde de santé) est laissée passer : c'est le jeton
 * JWT vérifié dans `handleConnection`, et lui seul, qui autorise l'accès aux
 * données — la CORS ne protège que le navigateur.
 */
const verifierOrigine = (
  origine: string | undefined,
  repondre: (err: Error | null, autorise?: boolean) => void,
): void => {
  if (!origine || originesAutorisees().includes(origine)) {
    repondre(null, true);
    return;
  }
  repondre(null, false);
};

@WebSocketGateway({
  cors: {
    origin: verifierOrigine,
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
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  /**
   * Poignée de main : mêmes exigences que sur une requête HTTP authentifiée.
   *
   * La vérification était auparavant faite ici à la main (`JwtService.verify`
   * secret-only, sans audience ni émetteur), avec sa propre garde de claim
   * `type` — une deuxième politique de jetons, qui dérivait de celle d'IAM.
   * Elle passe par `TokenService.verifyAccessToken`, seul détenteur de la
   * politique : un refresh token, un lien de désinscription ou un token de
   * vérification d'email n'ouvrent plus le canal.
   *
   * S'y ajoute la relecture du STATUT en base, équivalent WebSocket
   * d'`AccountStatusGuard` : sans elle, une connexion établie avant une
   * suspension continuait de recevoir les notifications de la victime pendant
   * toute la vie du socket, alors que ses requêtes HTTP étaient coupées.
   */
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

      const payload = await this.tokenService.verifyAccessToken(token);

      const user = await this.userRepository.findById(payload.sub);
      if (!user || user.isSuspended() || user.isClosed()) {
        client.disconnect();
        return;
      }

      client.data.userId = payload.sub;
      await client.join(`user-${payload.sub}`);
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
