import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { SessionCacheService } from 'src/iam/applications/services/session-cache.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/iam/domains/ports/user.repository';
import {
  CompteInactifError,
  CompteIntrouvableError,
} from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  MotifRetraitAccesPorteur,
  libelleMotifRetrait,
} from 'src/porteur-access/domains/motif-retrait';
import { acterAccesPorteur } from 'src/porteur-access/domains/retrait-acces-porteur';
import type {
  InvalidateurDeSession,
  JournalAudit,
  Notificateur,
} from '../ports/services-transverses.port';

export interface ResultatActeAccesPorteur {
  utilisateurId: number;
  /** Valeur de `users.porteurAccess` après l'acte. */
  porteurAccess: boolean;
  /** Horodatage du retrait, `null` après un ré-octroi. */
  accesRevoqueLe: Date | null;
  /** Motif CODÉ du retrait, `null` sur un ré-octroi. */
  motifRetrait: MotifRetraitAccesPorteur | null;
  /** Vrai si la rotation de session de la CIBLE a été coupée. */
  sessionInvalidee: boolean;
}

/**
 * Retrait et ré-octroi de l'accès porteur, hors dossier de demande.
 *
 * Le lot 4 avait livré l'OCTROI (décision sur une demande) sans son inverse :
 * un accès accordé ne pouvait plus se refermer, alors que la clause CGU de
 * retrait exige une mesure MOTIVÉE, NOTIFIÉE et RÉVERSIBLE. C'est ce que fait
 * ce use case, et rien d'autre — il ne touche à AUCUNE demande : le dossier
 * accepté reste la pièce qui prouve l'examen initial, et l'écraser effacerait
 * la preuve au moment même où l'on prend une mesure contre la personne.
 *
 * Deuxième chemin d'écriture de `users.porteurAccess`, le premier étant
 * `DeciderDemandePorteurUseCase`. Les deux passent par le domaine pour décider
 * de l'état à écrire, et par la MÊME méthode de port pour l'écrire.
 */
@Injectable()
export class StatuerAccesPorteurUseCase {
  private readonly logger = new Logger(StatuerAccesPorteurUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SessionCacheService)
    private readonly sessions: InvalidateurDeSession,
    @Inject(NotificationService) private readonly notifications: Notificateur,
    @Inject(AuditLogService) private readonly audit: JournalAudit,
  ) {}

  async execute(commande: {
    utilisateurId: number;
    /** Accès VOULU après l'acte : `false` = retrait, `true` = ré-octroi. */
    acces: boolean;
    /** Motif codé de la liste fermée — obligatoire sur un retrait. */
    motif?: MotifRetraitAccesPorteur | null;
    /** Administrateur auteur : jamais absent (mesure non automatisée). */
    decideurAdminId: number;
    decideurRole: string;
    maintenant?: Date;
  }): Promise<ResultatActeAccesPorteur> {
    const maintenant = commande.maintenant ?? new Date();

    const cible = await this.users.findById(commande.utilisateurId);
    const courant = await this.users.findAccesPorteur(commande.utilisateurId);
    if (!cible || !courant) throw new CompteIntrouvableError();

    // Même garde que la décision sur une demande, et pour la même raison : on
    // ne prend pas de mesure notifiée contre un compte qui ne peut pas y
    // réagir (suspendu), ni sur un compte hors relation d'affaires (clos,
    // supprimé — l'anonymisation a déjà tout refermé).
    if (!cible.canOpenSession()) throw new CompteInactifError();

    // Domaine D'ABORD, en mémoire : il éprouve le no-op (409) et l'obligation
    // de motif (400) sans qu'aucune écriture n'ait eu lieu.
    const acte = acterAccesPorteur({
      courant,
      acces: commande.acces,
      motif: commande.motif,
      maintenant,
    });

    await this.users.updatePorteurAccess(
      commande.utilisateurId,
      acte.etat.porteurAccess,
      acte.etat.accesRevoqueLe,
    );

    // Coupe la rotation de session de la CIBLE — inconditionnel ici, puisque
    // l'état vient de changer par construction (le no-op est refusé plus haut).
    //
    // Le garde de route relit la base à chaque requête : le retrait est donc
    // DÉJÀ effectif sans cela. Ce qui ne l'est pas, c'est le PROFIL que le
    // front garde en mémoire — l'espace porteur resterait affiché jusqu'à la
    // prochaine reconnexion. LIMITE ASSUMÉE, identique à celle de l'ADR :
    // l'access token déjà émis reste signé jusqu'à son expiration (1 h par
    // défaut) — sans conséquence, l'autorisation n'étant pas dans le jeton.
    const email = cible.email || null;
    let sessionInvalidee = false;
    if (email) {
      await this.sessions.invalidateRefreshTokenId(email);
      sessionInvalidee = true;
    }

    // Hors chemin critique : la mesure est prise, une notification perdue ne
    // l'annule pas.
    this.notifications
      .push(
        acte.estUnRetrait
          ? {
              utilisateurId: commande.utilisateurId,
              type: NotificationType.PORTEUR_ACCESS_REVOQUE,
              titre: 'Espace porteur fermé',
              // LIBELLÉ du motif CODÉ, et rien d'autre : aucun texte libre
              // n'existe sur ce chemin, il ne peut donc pas en sortir.
              message: `L'accès à votre espace porteur a été retiré. Motif : ${libelleMotifRetrait(
                acte.motifRetrait as MotifRetraitAccesPorteur,
              )} Votre espace investisseur, vos investissements et votre solde restent inchangés.`,
              metadata: { motifRetrait: acte.motifRetrait },
            }
          : {
              utilisateurId: commande.utilisateurId,
              type: NotificationType.PORTEUR_ACCESS_RETABLI,
              titre: 'Espace porteur rétabli',
              // Même correction qu'à l'octroi : aucune reconnexion n'est
              // nécessaire, l'accès étant relu en base à chaque requête.
              message:
                "L'accès à votre espace porteur a été rétabli : retrouvez-le dans votre menu. Votre espace investisseur reste inchangé.",
              metadata: {},
            },
      )
      .catch((erreur: unknown) =>
        this.logger.warn(
          `Notification d'accès porteur non émise (compte ${commande.utilisateurId}) : ${String(erreur)}`,
        ),
      );

    // L'AuditInterceptor global journalise la requête mais ignore l'état
    // ANTÉRIEUR — seule information qui permette de relire un retrait ou un
    // rétablissement. Entrée métier explicite, donc.
    await this.audit
      .create(
        String(commande.decideurAdminId),
        commande.decideurRole,
        acte.estUnRetrait
          ? 'porteur_access.acces.retire'
          : 'porteur_access.acces.retabli',
        'user',
        String(commande.utilisateurId),
        undefined,
        undefined,
        {
          // Qui / quoi / quand / états — AUCUN texte libre : le motif est un
          // CODE de liste fermée, seul admissible dans `audit_log` (cinq ans,
          // hors barème de purge du texte libre, hors export).
          utilisateurId: commande.utilisateurId,
          porteurAccessAvant: courant.porteurAccess,
          porteurAccessApres: acte.etat.porteurAccess,
          motifRetrait: acte.motifRetrait,
          accesRevoqueLe: acte.etat.accesRevoqueLe
            ? acte.etat.accesRevoqueLe.toISOString()
            : null,
          sessionInvalidee,
        },
      )
      .catch((erreur: unknown) =>
        // `error` et non `warn` : un retrait d'accès non tracé est un trou dans
        // la piste d'audit, pas une gêne.
        this.logger.error(
          `Audit d'accès porteur NON écrit (compte ${commande.utilisateurId}) : ${String(erreur)}`,
        ),
      );

    return {
      utilisateurId: commande.utilisateurId,
      porteurAccess: acte.etat.porteurAccess,
      accesRevoqueLe: acte.etat.accesRevoqueLe,
      motifRetrait: acte.motifRetrait,
      sessionInvalidee,
    };
  }
}
