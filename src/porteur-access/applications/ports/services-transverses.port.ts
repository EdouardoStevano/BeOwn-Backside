import type { AuditLogService } from 'src/notifications/applications/audit-log.service';
import type { NotificationService } from 'src/notifications/applications/notification.service';
import type { SessionCacheService } from 'src/iam/applications/services/session-cache.service';

/**
 * Vues RESTREINTES des services transverses consommés par ce module (ISP).
 *
 * Les use cases sont injectés avec le jeton de la classe concrète
 * (`@Inject(AuditLogService)`, …) mais TYPÉS avec ces alias : ils ne voient
 * que la ou les méthodes dont ils ont besoin. Deux effets concrets :
 *
 *  - un use case de décision ne peut pas, par inadvertance, se mettre à lire
 *    le journal d'audit ou à purger des notifications ;
 *  - un double de test n'a que ces méthodes à honorer, sans `as any` ni
 *    reconstruction d'un service entier — le domaine et l'application se
 *    testent donc sans Redis, sans base et sans WebSocket.
 *
 * Un port dédié (abstract class + adaptateur) aurait ajouté trois fichiers
 * pour la même garantie : ces services sont déjà des services APPLICATIFS,
 * pas des SDK d'infrastructure, et le dépôt les injecte partout ainsi.
 */

/** Journaliser une décision. */
export type JournalAudit = Pick<AuditLogService, 'create'>;

/** Prévenir un utilisateur, ou l'équipe qui instruit. */
export type Notificateur = Pick<NotificationService, 'push' | 'pushToRoles'>;

/** Couper la rotation de session d'un compte — et rien d'autre. */
export type InvalidateurDeSession = Pick<
  SessionCacheService,
  'invalidateRefreshTokenId'
>;
