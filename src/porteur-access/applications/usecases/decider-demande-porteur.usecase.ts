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
  DemandeAccesPorteur,
  StatutDemandeAccesPorteur,
} from 'src/porteur-access/domains/demande-acces-porteur';
import {
  MotifRefusAccesPorteur,
  libelleMotifRefus,
} from 'src/porteur-access/domains/motif-refus';
import {
  CompteInactifError,
  CompteIntrouvableError,
  DemandeAccesPorteurIntrouvableError,
} from 'src/porteur-access/domains/errors/porteur-access.errors';
import {
  DemandeAccesPorteurReader,
  DemandeAccesPorteurWriter,
} from '../ports/demande-acces-porteur.repository';
import type {
  InvalidateurDeSession,
  JournalAudit,
  Notificateur,
} from '../ports/services-transverses.port';

/** Les deux seules issues qu'un instructeur peut prononcer. */
export type DecisionDemandeAccesPorteur =
  | StatutDemandeAccesPorteur.ACCEPTEE
  | StatutDemandeAccesPorteur.REFUSEE;

export interface ResultatDecisionAccesPorteur {
  demande: DemandeAccesPorteur;
  /** Valeur de `users.porteurAccess` après la décision. */
  porteurAccess: boolean;
  /** Vrai si la rotation de session de la CIBLE a été coupée. */
  sessionInvalidee: boolean;
}

/**
 * Décision d'un instructeur sur une demande d'accès porteur.
 *
 * C'est le seul endroit du code qui écrit `users.porteurAccess`. L'ORDRE des
 * écritures est délibéré : le drapeau — écriture IDEMPOTENTE — est posé AVANT
 * la transition de la demande. Si la seconde écriture échoue, la demande reste
 * instruisible et l'instructeur rejoue son PATCH ; l'ordre inverse laisserait
 * une demande « acceptée » définitivement close sur un compte sans accès, plus
 * aucune reprise possible (la machine à états interdit de re-décider).
 *
 * Un REFUS remet explicitement le drapeau à `false` : après une décision, la
 * décision est la seule source de vérité de l'accès — aucune écriture
 * partielle antérieure ne peut survivre.
 */
@Injectable()
export class DeciderDemandePorteurUseCase {
  private readonly logger = new Logger(DeciderDemandePorteurUseCase.name);

  constructor(
    private readonly lecture: DemandeAccesPorteurReader,
    private readonly ecriture: DemandeAccesPorteurWriter,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SessionCacheService)
    private readonly sessions: InvalidateurDeSession,
    @Inject(NotificationService) private readonly notifications: Notificateur,
    @Inject(AuditLogService) private readonly audit: JournalAudit,
  ) {}

  async execute(commande: {
    demandeId: string;
    decision: DecisionDemandeAccesPorteur;
    /** Code de la liste fermée — obligatoire sur un refus. */
    motifRefus?: MotifRefusAccesPorteur | null;
    /** Précision libre INTERNE, jamais communiquée au demandeur. */
    motifRefusComplement?: string | null;
    /** Administrateur auteur : jamais absent (décision non automatisée). */
    decideurAdminId: number;
    decideurRole: string;
    maintenant?: Date;
  }): Promise<ResultatDecisionAccesPorteur> {
    const maintenant = commande.maintenant ?? new Date();

    const demande = await this.lecture.findById(commande.demandeId);
    if (!demande) throw new DemandeAccesPorteurIntrouvableError();

    const cible = await this.users.findById(demande.utilisateurId);
    const accesActuel = await this.users.findAccesPorteur(
      demande.utilisateurId,
    );
    if (!cible || !accesActuel) throw new CompteIntrouvableError();

    // Deuxième ceinture (la première est la caducité posée à l'anonymisation) :
    // aucune décision ne se rend sur un compte hors relation d'affaires.
    // `canOpenSession()` couvre les trois états concernés — suspendu, clos,
    // supprimé. La suspension est incluse à dessein : accorder l'espace porteur
    // à un compte suspendu n'a pas de sens, et le refuser reviendrait à clore
    // un dossier au nom de quelqu'un qui ne peut pas réagir. Le dossier attend
    // la réactivation — ou la caducité, si le compte finit par être supprimé.
    if (!cible.canOpenSession()) throw new CompteInactifError();

    const accepte = commande.decision === StatutDemandeAccesPorteur.ACCEPTEE;

    // Transition D'ABORD, en mémoire : elle éprouve la légalité du passage
    // (409 si la demande est déjà décidée) et l'obligation de motif (400) sans
    // qu'aucune écriture n'ait eu lieu.
    if (accepte) {
      demande.accepter(commande.decideurAdminId, maintenant);
    } else {
      demande.refuser(
        commande.decideurAdminId,
        commande.motifRefus,
        commande.motifRefusComplement,
        maintenant,
      );
    }

    // Écriture idempotente, en premier (voir l'en-tête de classe).
    await this.users.updatePorteurAccess(demande.utilisateurId, accepte);
    const enregistree = await this.ecriture.enregistrer(demande);

    // Coupe la rotation de session de la CIBLE.
    //
    // Le garde de route relit la base à chaque requête : l'accès est donc déjà
    // effectif sans cela. Ce qui ne l'est pas, c'est le PROFIL que le front a
    // en mémoire — l'espace porteur n'apparaîtrait qu'à la prochaine
    // reconnexion. La révocation force ce rafraîchissement, et fait pour un
    // RETRAIT d'accès ce que `PATCH /admin/investors/:id/role` fait pour une
    // rétrogradation. LIMITE ASSUMÉE, identique à celle de l'ADR : l'access
    // token déjà émis reste signé jusqu'à son expiration (1 h par défaut) —
    // sans conséquence ici, puisque l'autorisation n'est pas dans le jeton.
    const doitInvalider = accepte || accesActuel.porteurAccess;
    const email = cible.email || null;
    let sessionInvalidee = false;
    if (doitInvalider && email) {
      await this.sessions.invalidateRefreshTokenId(email);
      sessionInvalidee = true;
    }

    // Hors chemin critique : la décision est prise, une notification perdue ne
    // l'annule pas.
    this.notifications
      .push(
        accepte
          ? {
              utilisateurId: demande.utilisateurId,
              type: NotificationType.PORTEUR_ACCESS_ACCEPTE,
              titre: 'Espace porteur ouvert',
              message:
                "Votre demande d'accès porteur a été acceptée. Reconnectez-vous pour accéder à votre espace porteur ; votre espace investisseur reste inchangé.",
              metadata: { demandeId: enregistree.id },
            }
          : {
              utilisateurId: demande.utilisateurId,
              type: NotificationType.PORTEUR_ACCESS_REFUSE,
              titre: "Demande d'accès porteur refusée",
              // LIBELLÉ du motif CODÉ, et rien d'autre : ni la motivation
              // saisie par la personne, ni le complément interne de
              // l'instructeur ne sortent d'ici.
              message: `Votre demande d'accès porteur n'a pas été retenue. Motif : ${libelleMotifRefus(
                enregistree.motifRefus as MotifRefusAccesPorteur,
              )}`,
              metadata: { demandeId: enregistree.id },
            },
      )
      .catch((erreur: unknown) =>
        this.logger.warn(
          `Notification de décision non émise (demande ${enregistree.id}) : ${String(erreur)}`,
        ),
      );

    // L'AuditInterceptor global journalise la requête mais ignore l'état
    // ANTÉRIEUR — seule information qui permette de relire un octroi ou un
    // retrait d'accès. Entrée métier explicite, donc.
    await this.audit
      .create(
        String(commande.decideurAdminId),
        commande.decideurRole,
        accepte
          ? 'porteur_access.demande.acceptee'
          : 'porteur_access.demande.refusee',
        'demande_acces_porteur',
        commande.demandeId,
        undefined,
        undefined,
        {
          // Qui / quoi / quand / états — AUCUN texte libre : ni la motivation
          // de la personne, ni le complément de l'instructeur n'entrent dans
          // `audit_log`, conservé cinq ans et hors du barème de purge du
          // texte libre. Seul le motif CODÉ y figure.
          utilisateurId: demande.utilisateurId,
          porteurAccessAvant: accesActuel.porteurAccess,
          porteurAccessApres: accepte,
          motifRefus: enregistree.motifRefus,
          sessionInvalidee,
        },
      )
      .catch((erreur: unknown) =>
        // `error` et non `warn` : une décision d'accès non tracée est un trou
        // dans la piste d'audit, pas une gêne.
        this.logger.error(
          `Audit de décision NON écrit (demande ${commande.demandeId}) : ${String(erreur)}`,
        ),
      );

    return { demande: enregistree, porteurAccess: accepte, sessionInvalidee };
  }
}
