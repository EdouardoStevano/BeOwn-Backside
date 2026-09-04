import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { ProfilPPEntity } from 'src/profiles/infrastructure/persistences/entities/profil-pp.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { PersonneGeleeEntity } from './entities/personne-gelee.entity';
import { SanctionsScreeningPort } from './sanctions-screening.port';
import {
  IdentiteControlee,
  PersonneGeleeRef,
  chercherCorrespondances,
  normaliserDate,
} from './domains/sanctions-screening';

/** Taille de page du re-scan global — jamais tout le stock en mémoire. */
const TAILLE_PAGE_RESCAN = 200;

/**
 * Screening de la liste interne de gel des avoirs.
 *
 * La règle de correspondance vit dans le domaine PUR
 * (`domains/sanctions-screening.ts`) ; ce service ne fait qu'assembler les
 * identités (compte + profil personne physique) et acheminer les alertes
 * par le canal compliance existant (audit log + notifications admin), comme
 * `AmlMonitorService`.
 *
 * Une correspondance NE GÈLE JAMAIS seule : elle alerte, l'humain décide
 * (endpoint admin dédié — docs/adr/ADR-gel-des-avoirs.md).
 */
@Injectable()
export class SanctionsScreeningService extends SanctionsScreeningPort {
  private readonly logger = new Logger(SanctionsScreeningService.name);

  constructor(
    @InjectRepository(PersonneGeleeEntity)
    private readonly personneRepo: Repository<PersonneGeleeEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProfilPPEntity)
    private readonly profilRepo: Repository<ProfilPPEntity>,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async screenUser(userId: number): Promise<number> {
    try {
      const liste = await this.listeActive();
      if (liste.length === 0) return 0;
      return await this.screenContreListe(userId, liste, 'kyc-valide');
    } catch (err) {
      // Best-effort par contrat de port : la validation KYC ne doit jamais
      // échouer à cause du screening — l'incident est journalisé.
      this.logger.error(
        `Screening impossible pour userId=${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  async rescanTous(): Promise<{ scannes: number; correspondances: number }> {
    const liste = await this.listeActive();
    let scannes = 0;
    let correspondances = 0;
    if (liste.length === 0) return { scannes, correspondances };

    // Pagination par curseur sur la clé primaire : re-scan borné en mémoire,
    // uniquement les comptes plateforme non anonymisés (un compte anonymisé
    // n'a plus d'identité à comparer).
    let dernierUserId = 0;
    for (;;) {
      const page = await this.userRepo
        .createQueryBuilder('u')
        .select(['u.userId AS "userId"'])
        .where('u.userId > :dernierUserId', { dernierUserId })
        .andWhere('u.role IN (:...roles)', {
          roles: [UserRole.INVESTISSEUR, UserRole.PORTEUR, UserRole.CGP],
        })
        .andWhere('u.anonymiseLe IS NULL')
        .orderBy('u.userId', 'ASC')
        .limit(TAILLE_PAGE_RESCAN)
        .getRawMany<{ userId: number }>();
      if (page.length === 0) break;

      for (const { userId } of page) {
        correspondances += await this.screenContreListe(
          userId,
          liste,
          'rescan-global',
        );
        scannes++;
      }
      dernierUserId = page[page.length - 1].userId;
    }

    this.logger.log(
      `Re-scan gel des avoirs terminé : ${scannes} compte(s), ${correspondances} correspondance(s).`,
    );
    return { scannes, correspondances };
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private async listeActive(): Promise<PersonneGeleeRef[]> {
    const rows = await this.personneRepo.find({ where: { actif: true } });
    return rows.map((p) => ({
      id: p.id,
      nom: p.nom,
      prenom: p.prenom,
      dateNaissance: normaliserDate(p.dateNaissance),
    }));
  }

  /**
   * Identités comparables d'un utilisateur : le nom du compte ET celui du
   * profil personne physique (ils peuvent diverger — le profil porte
   * l'identité vérifiée, le compte la saisie d'inscription).
   */
  private async identites(userId: number): Promise<IdentiteControlee[]> {
    const [user, profil] = await Promise.all([
      this.userRepo.findOne({
        where: { userId },
        select: ['userId', 'firstname', 'lastname'],
      }),
      this.profilRepo.findOne({ where: { utilisateurId: userId } }),
    ]);
    const dateNaissance = normaliserDate(profil?.dateNaissance ?? null);
    const identites: IdentiteControlee[] = [];
    if (user?.lastname || user?.firstname) {
      identites.push({
        nom: user.lastname,
        prenom: user.firstname,
        dateNaissance,
      });
    }
    if (profil?.nom || profil?.prenom) {
      identites.push({
        nom: profil.nom,
        prenom: profil.prenom,
        dateNaissance,
      });
    }
    return identites;
  }

  private async screenContreListe(
    userId: number,
    liste: PersonneGeleeRef[],
    declencheur: 'kyc-valide' | 'rescan-global',
  ): Promise<number> {
    const identites = await this.identites(userId);
    const touchees = new Map<string, PersonneGeleeRef>();
    for (const identite of identites) {
      for (const p of chercherCorrespondances(identite, liste)) {
        touchees.set(p.id, p);
      }
    }
    if (touchees.size === 0) return 0;

    const refs = [...touchees.keys()];
    this.logger.warn(
      `Correspondance liste de gel : userId=${userId} personnes=[${refs.join(', ')}] (${declencheur})`,
    );

    await this.auditLog
      .create(
        'system',
        'system',
        'aml.gel.correspondance',
        'user',
        String(userId),
        undefined,
        undefined,
        { personnesGelees: refs, declencheur },
      )
      .catch(() => {});

    await this.notificationService
      .pushToAdmins({
        type: NotificationType.SECURITE,
        titre: 'Gel des avoirs : correspondance à examiner',
        message:
          `Le compte #${userId} correspond à ${touchees.size} inscription(s) de la ` +
          `liste interne de gel (${declencheur}). Examiner le dossier et, le cas ` +
          `échéant, geler le compte manuellement — aucune action automatique n'a été prise.`,
        roles: [UserRole.COMPLIANCE, UserRole.RCCI, UserRole.SUPER_ADMIN],
        metadata: { userId, personnesGelees: refs, declencheur },
      })
      .catch(() => {});

    return touchees.size;
  }
}
