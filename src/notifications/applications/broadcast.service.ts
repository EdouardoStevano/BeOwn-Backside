import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  AdminSettingsEntity,
  BroadcastChannelToggles,
  BroadcastSettings,
  mergeBroadcastSettings,
} from 'src/admin/entities/admin-settings.entity';
import {
  EMAIL_SERVICE,
  type EmailService,
} from 'src/common/email/email.service';
import { EmailTemplateService } from 'src/common/email/email-template.service';
import { SMS_SERVICE, type SmsService } from 'src/shared/sms/sms.service';
import { TokenService } from 'src/iam/applications/services/token.service';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { UserPreferencesEntity } from 'src/iam/infrastructure/persistence/entities/user-preferences.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
import { NotificationType } from '../infrastructure/persistences/entities/notification.entity';
import { AuditLogService } from './audit-log.service';
import { NotificationService } from './notification.service';

/** Taille des lots d'envoi : borne la charge sur Brevo/Twilio et la mémoire. */
const BATCH_SIZE = 20;

/**
 * E.164 strict — même contrat que TwilioSmsService : un numéro saisi au format
 * national (06…) n'est PAS devinable côté serveur (le pays de résidence n'est
 * pas fiable), on saute le destinataire plutôt que d'envoyer un SMS erroné.
 */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Défauts appliqués aux utilisateurs SANS ligne dans `user_preferences`
 * (décision D2 « opt-out » du design 2026-07-10) : pas de ligne = l'utilisateur
 * n'a jamais exprimé de choix → il reçoit les annonces, le lien de
 * désinscription présent dans chaque email servant de garde-fou RGPD.
 *
 * Volontairement DIFFÉRENT des défauts de UserPreferencesEntity
 * (notifMarketing false) : une ligne n'est matérialisée que lorsque
 * l'utilisateur passe par une UI de préférences ou par le lien de
 * désinscription — dans les deux cas son choix explicite est alors respecté
 * verbatim (voir loadRecipients), y compris un notifMarketing=false issu d'un
 * unsubscribe.
 */
export const BROADCAST_PREF_DEFAULTS = {
  notifEmail: true,
  notifSms: true,
  notifMarketing: true,
};

type BroadcastEvent = keyof BroadcastSettings;

interface CampaignConfig {
  /** Clé des toggles admin (notifications.broadcast.<event>). */
  event: BroadcastEvent;
  /** Colonne d'horodatage anti-doublon posée sur le projet. */
  stampColumn: 'broadcastAnnonceAt' | 'broadcastCollecteAt';
  /** Clé du template email (EmailTemplateService.render). */
  templateKey: string;
  /** Titre de la notification in-app. */
  notifTitre: string;
  /** Action journalisée dans l'audit trail. */
  auditAction: string;
}

const CAMPAIGNS: Record<BroadcastEvent, CampaignConfig> = {
  nouveauProjet: {
    event: 'nouveauProjet',
    stampColumn: 'broadcastCollecteAt',
    templateKey: 'new-project',
    notifTitre: "Projet ouvert à l'investissement",
    auditAction: 'notification.broadcast.nouveau_projet',
  },
  ouvertureReservation: {
    event: 'ouvertureReservation',
    stampColumn: 'broadcastAnnonceAt',
    templateKey: 'ouverture-reservation',
    notifTitre: 'Réservations ouvertes',
    auditAction: 'notification.broadcast.ouverture_reservation',
  },
};

interface Recipient {
  userId: number;
  prenom: string;
  email: string | null;
  telephone: string | null;
  notifEmail: boolean;
  notifSms: boolean;
  notifMarketing: boolean;
}

/** Variables communes injectées dans les templates (hors `prenom`/`unsubscribeUrl`, propres à chaque destinataire). */
interface TemplateVars {
  titre: string;
  ville: string;
  triCible: number | null;
  dateOuverture: string;
  dateCloture: string;
  url: string;
}

interface BroadcastStats {
  destinataires: number;
  emails: number;
  sms: number;
  /**
   * Destinataires n'ayant reçu QUE la notification in-app (aucun email ni SMS
   * envoyé) — parce qu'ils sont opt-out, que le canal est désactivé, ou que
   * leur téléphone n'est pas exploitable. À ne pas confondre avec « filtré » :
   * ces comptes ont bien été touchés in-app.
   */
  inAppOnly: number;
  errors: number;
  templateDisabled: boolean;
}

export interface BroadcastResult extends BroadcastStats {
  /** false quand la campagne était déjà diffusée (ou le projet introuvable). */
  diffuse: boolean;
}

/**
 * Diffusion de masse email/SMS/in-app des deux annonces produit :
 * « ouverture de réservation » (projet passé en annonce) et « nouveau projet »
 * (projet passé en collecte).
 *
 * Trois garde-fous structurent le service :
 * 1. ANTI-DOUBLON — l'horodatage est posé sur le projet AVANT tout envoi, via
 *    un UPDATE conditionnel (`WHERE stamp IS NULL`) : deux appels concurrents
 *    ne peuvent pas diffuser deux fois.
 * 2. JAMAIS DE THROW — la transition de statut du projet (l'appelant) ne doit
 *    jamais échouer parce qu'un email n'est pas parti. Tout est capturé et
 *    loggué ; les appelants invoquent en fire-and-forget.
 * 3. CONSENTEMENT — seuls les comptes ACTIFS et opt-in marketing reçoivent
 *    email/SMS ; les SMS sont OFF par défaut (coût réel Twilio).
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserPreferencesEntity)
    private readonly prefsRepo: Repository<UserPreferencesEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilRepo: Repository<ProfilPPEntity>,
    @InjectRepository(AdminSettingsEntity)
    private readonly settingsRepo: Repository<AdminSettingsEntity>,
    private readonly templates: EmailTemplateService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
    private readonly tokenService: TokenService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  /** Campagne « réservations ouvertes » — projet publié en annonce. */
  announceReservationOpened(
    projetId: number | string,
    triggeredBy: number,
  ): Promise<BroadcastResult> {
    return this.run(projetId, triggeredBy, CAMPAIGNS.ouvertureReservation);
  }

  /** Campagne « nouveau projet » — projet ouvert à l'investissement. */
  announceProjectLaunched(
    projetId: number | string,
    triggeredBy: number,
  ): Promise<BroadcastResult> {
    return this.run(projetId, triggeredBy, CAMPAIGNS.nouveauProjet);
  }

  private async run(
    projetId: number | string,
    triggeredBy: number,
    campaign: CampaignConfig,
  ): Promise<BroadcastResult> {
    const stats: BroadcastStats = {
      destinataires: 0,
      emails: 0,
      sms: 0,
      inAppOnly: 0,
      errors: 0,
      templateDisabled: false,
    };

    const id = String(projetId);
    // Portés hors du try pour que le filet de sécurité (catch) puisse décider
    // s'il faut réarmer l'horodatage anti-doublon.
    let project: ProjectEntity | null = null;
    let claimed = false;
    let deliveriesAttempted = 0;

    try {
      project = await this.projectRepo.findOne({ where: { id } });
      if (!project) {
        this.logger.warn(
          `Diffusion "${campaign.event}" ignorée : projet ${id} introuvable.`,
        );
        return { ...stats, diffuse: false };
      }

      claimed = await this.claim(project, campaign);
      if (!claimed) {
        this.logger.log(
          `Diffusion "${campaign.event}" déjà effectuée pour le projet ${id} — no-op.`,
        );
        return { ...stats, diffuse: false };
      }

      const toggles = await this.loadToggles(campaign.event);
      const recipients = await this.loadRecipients(toggles);
      stats.destinataires = recipients.length;

      const vars = this.templateVars(project);
      const smsText = this.smsText(campaign.event, project, vars.url);

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map((r) => {
            // Incrémenté à l'entrée de la boucle d'envoi : marque le passage
            // du « avant tout envoi » (réarmement du stamp permis) au « au
            // moins un destinataire traité » (at-most-once, on garde le stamp).
            deliveriesAttempted++;
            return this.deliver(
              r,
              project as ProjectEntity,
              campaign,
              toggles,
              vars,
              smsText,
              stats,
            );
          }),
        );
      }

      this.logger.log(
        `Diffusion "${campaign.event}" projet ${id} : ${stats.destinataires} destinataire(s), ` +
          `${stats.emails} email(s), ${stats.sms} SMS, ${stats.inAppOnly} in-app seul, ${stats.errors} erreur(s).`,
      );

      await this.audit(project, campaign, triggeredBy, stats);
      return { ...stats, diffuse: true };
    } catch (err) {
      // Filet de sécurité : aucune exception ne doit remonter à l'appelant
      // (la transition de statut du projet prime sur la diffusion).
      this.logger.error(
        `Diffusion "${campaign.event}" en échec pour le projet ${id}`,
        err instanceof Error ? err.stack : String(err),
      );

      // Réarmement de l'horodatage : si l'échec est survenu APRÈS avoir posé le
      // stamp mais AVANT qu'un seul destinataire n'ait été traité, la campagne
      // n'a atteint personne et resterait pourtant bloquée à jamais (pas
      // d'endpoint de resend, déclencheur fire-and-forget). On remet le stamp à
      // NULL pour qu'une prochaine transition puisse re-déclencher. Si au moins
      // un envoi a été tenté, on LAISSE le stamp (at-most-once : ne jamais
      // re-diffuser à ceux qui ont déjà reçu).
      if (claimed && deliveriesAttempted === 0 && project) {
        await this.resetClaim(project, campaign);
      } else if (claimed) {
        this.logger.warn(
          `Diffusion "${campaign.event}" projet ${id} interrompue après ${deliveriesAttempted} envoi(s) tenté(s) — horodatage conservé (at-most-once).`,
        );
      }

      return { ...stats, diffuse: false };
    }
  }

  /**
   * Réarme l'horodatage anti-doublon (le remet à NULL) quand une campagne a
   * échoué avant d'atteindre le moindre destinataire — voir run(). Toujours
   * silencieux : jamais de throw depuis le filet de sécurité.
   */
  private async resetClaim(
    project: ProjectEntity,
    campaign: CampaignConfig,
  ): Promise<void> {
    try {
      await this.projectRepo.update(
        { id: project.id },
        { [campaign.stampColumn]: null },
      );
      this.logger.warn(
        `Diffusion "${campaign.event}" projet ${project.id} échouée avant tout envoi — horodatage réarmé, campagne re-déclenchable.`,
      );
    } catch (err) {
      this.logger.error(
        `Réarmement de l'horodatage "${campaign.event}" impossible pour le projet ${project.id} — la campagne restera bloquée`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Pose l'horodatage anti-doublon AVANT tout envoi. L'UPDATE est conditionné
   * à `stamp IS NULL` : sous appels concurrents, un seul gagne (le second voit
   * affected = 0 et abandonne).
   */
  private async claim(
    project: ProjectEntity,
    campaign: CampaignConfig,
  ): Promise<boolean> {
    if (project[campaign.stampColumn]) return false;

    const res = await this.projectRepo.update(
      { id: project.id, [campaign.stampColumn]: IsNull() },
      { [campaign.stampColumn]: new Date() },
    );
    return (res?.affected ?? 0) > 0;
  }

  /** Toggles admin de l'événement — défauts si la table/ligne est absente. */
  private async loadToggles(
    event: BroadcastEvent,
  ): Promise<BroadcastChannelToggles> {
    let row: AdminSettingsEntity | null = null;
    try {
      row = await this.settingsRepo.findOne({ where: { id: 'default' } });
    } catch (err) {
      this.logger.warn(
        `Lecture des paramètres de diffusion impossible — défauts appliqués : ${(err as Error)?.message}`,
      );
    }
    return mergeBroadcastSettings(row?.settings?.notifications?.broadcast)[
      event
    ];
  }

  /**
   * Destinataires : comptes ACTIFS uniquement (les statuts cree /
   * email_verifie / suspendu / clos / supprime sont exclus), enrichis de leurs
   * préférences et de leur téléphone. Les téléphones ne sont chargés que si le
   * canal SMS est activé.
   */
  private async loadRecipients(
    toggles: BroadcastChannelToggles,
  ): Promise<Recipient[]> {
    const users = await this.userRepo.find({
      where: { status: UserStatus.ACTIF },
    });
    if (users.length === 0) return [];

    const ids = users.map((u) => u.userId);
    const prefs = await this.prefsRepo.find({ where: { userId: In(ids) } });
    const prefsByUser = new Map(prefs.map((p) => [p.userId, p]));

    const phoneByUser = new Map<number, string | null>();
    if (toggles.sms) {
      const profils = await this.profilRepo.find({
        where: { utilisateurId: In(ids) },
      });
      for (const p of profils) {
        phoneByUser.set(p.utilisateurId, p.telephone ?? null);
      }
    }

    return users.map((u) => {
      const p = prefsByUser.get(u.userId);
      return {
        userId: u.userId,
        prenom: u.firstname?.trim() || 'investisseur',
        email: u.userEmail?.email ?? null,
        telephone: phoneByUser.get(u.userId) ?? null,
        notifEmail: p?.notifEmail ?? BROADCAST_PREF_DEFAULTS.notifEmail,
        notifSms: p?.notifSms ?? BROADCAST_PREF_DEFAULTS.notifSms,
        notifMarketing:
          p?.notifMarketing ?? BROADCAST_PREF_DEFAULTS.notifMarketing,
      };
    });
  }

  /**
   * Un destinataire = une notification in-app (toujours) + un email et/ou un
   * SMS selon les toggles admin et ses préférences. Chaque canal est isolé :
   * l'échec de l'un n'empêche pas les autres, et jamais de throw (les lots
   * tournent en Promise.allSettled).
   */
  private async deliver(
    r: Recipient,
    project: ProjectEntity,
    campaign: CampaignConfig,
    toggles: BroadcastChannelToggles,
    vars: TemplateVars,
    smsText: string,
    stats: BroadcastStats,
  ): Promise<void> {
    let sent = 0;

    try {
      await this.notifications.push({
        utilisateurId: r.userId,
        type: NotificationType.NOUVEAU_PROJET,
        titre: campaign.notifTitre,
        message: this.inAppMessage(campaign.event, project),
        metadata: {
          projectId: project.id,
          slug: project.slug,
          ville: project.ville,
          statut: project.statut,
          evenement: campaign.event,
        },
      });
    } catch (err) {
      stats.errors++;
      this.logger.warn(
        `Notification in-app échouée (user ${r.userId}) : ${(err as Error)?.message}`,
      );
    }

    const emailEligible =
      toggles.email && !!r.email && r.notifEmail && r.notifMarketing;
    if (emailEligible) {
      try {
        const unsubscribeUrl = await this.unsubscribeUrl(r.userId);
        const rendered = await this.templates.render(campaign.templateKey, {
          ...vars,
          prenom: r.prenom,
          unsubscribeUrl,
        });
        if (!rendered) {
          // Template désactivé par l'admin (ou introuvable) : aucun email ne
          // part, mais SMS et in-app continuent.
          if (!stats.templateDisabled) {
            stats.templateDisabled = true;
            this.logger.warn(
              `Template email "${campaign.templateKey}" désactivé ou introuvable — diffusion sans email.`,
            );
          }
        } else if (!this.emailService.sendTransactionalEmail) {
          this.logger.warn(
            'Le transport email ne supporte pas sendTransactionalEmail — diffusion sans email.',
          );
        } else {
          await this.emailService.sendTransactionalEmail(
            r.email as string,
            rendered.sujet,
            rendered.html,
          );
          stats.emails++;
          sent++;
        }
      } catch (err) {
        stats.errors++;
        this.logger.warn(
          `Email de diffusion échoué (user ${r.userId}) : ${(err as Error)?.message}`,
        );
      }
    }

    const smsEligible = toggles.sms && r.notifSms && r.notifMarketing;
    if (smsEligible) {
      if (!r.telephone || !E164_REGEX.test(r.telephone)) {
        this.logger.log(
          `SMS de diffusion ignoré (user ${r.userId}) : téléphone absent ou non E.164.`,
        );
      } else {
        try {
          await this.smsService.sendTransactional(r.telephone, smsText);
          stats.sms++;
          sent++;
        } catch (err) {
          stats.errors++;
          this.logger.warn(
            `SMS de diffusion échoué (user ${r.userId}) : ${(err as Error)?.message}`,
          );
        }
      }
    }

    // Aucun email/SMS parti : le destinataire n'a reçu que la notif in-app.
    if (sent === 0) stats.inAppOnly++;
  }

  private async unsubscribeUrl(userId: number): Promise<string> {
    const token = await this.tokenService.generateUnsubscribeToken(userId);
    return `${this.frontendUrl()}/desinscription?token=${token}`;
  }

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    ).replace(/\/+$/, '');
  }

  private templateVars(project: ProjectEntity): TemplateVars {
    const url = `${this.frontendUrl()}/projets/${project.slug}`;
    return {
      titre: project.titre,
      ville: project.ville ?? '',
      triCible: project.triCible != null ? Number(project.triCible) : null,
      dateOuverture: this.formatDate(project.dateOuvertureCollecte),
      dateCloture: this.formatDate(project.dateCloturePrevue),
      url,
    };
  }

  private formatDate(value: Date | null): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Message SMS : court, sans accent ni emoji (GSM-7, 1 segment facturé). */
  private smsText(
    event: BroadcastEvent,
    project: ProjectEntity,
    url: string,
  ): string {
    return event === 'nouveauProjet'
      ? `BeOwn : nouveau projet ${project.titre} ouvert a l'investissement. ${url}`
      : `BeOwn : reservations ouvertes pour ${project.titre}. ${url}`;
  }

  private inAppMessage(event: BroadcastEvent, project: ProjectEntity): string {
    const lieu = [project.ville, project.pays].filter(Boolean).join(', ');
    const suffixe = lieu ? ` (${lieu})` : '';
    return event === 'nouveauProjet'
      ? `« ${project.titre} »${suffixe} est ouvert à l'investissement.`
      : `Les réservations pour « ${project.titre} »${suffixe} sont ouvertes.`;
  }

  private async audit(
    project: ProjectEntity,
    campaign: CampaignConfig,
    triggeredBy: number,
    stats: BroadcastStats,
  ): Promise<void> {
    try {
      const acteur = await this.userRepo.findOne({
        where: { userId: triggeredBy },
      });
      await this.auditLog.create(
        String(triggeredBy),
        acteur?.role ?? 'system',
        campaign.auditAction,
        'projet',
        project.id,
        undefined,
        undefined,
        {
          projetTitre: project.titre,
          destinataires: stats.destinataires,
          emails: stats.emails,
          sms: stats.sms,
          inAppOnly: stats.inAppOnly,
          errors: stats.errors,
          templateDisabled: stats.templateDisabled,
          triggeredBy,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Audit de la diffusion "${campaign.event}" impossible : ${(err as Error)?.message}`,
      );
    }
  }
}
