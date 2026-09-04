import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import {
  CODE_AVOIRS_GELES,
  messageAvoirsGeles,
} from './domains/gel-des-avoirs';
import { GelDesAvoirsPort } from './gel-des-avoirs.port';

/**
 * Gel des avoirs (art. L. 562-4 CMF) — pose, levée et garde applicative.
 *
 * Deux invariants, non négociables :
 *  - le gel est un acte HUMAIN : seuls `geler`/`degeler` (endpoint admin
 *    compliance, motif obligatoire, audité) écrivent le statut — le screening
 *    ne fait que signaler ;
 *  - le gel bloque les SORTIES (dépôt, souscription, retrait, achat
 *    secondaire) et rien d'autre : les crédits entrants — distributions de
 *    loyers — restent versés au wallet (docs/adr/ADR-gel-des-avoirs.md).
 */
@Injectable()
export class GelDesAvoirsService extends GelDesAvoirsPort {
  private readonly logger = new Logger(GelDesAvoirsService.name);

  /**
   * Contact affiché dans le message de refus. Le texte de conformité laisse
   * l'adresse « à compléter » : l'exemple qu'il propose sert de défaut,
   * surchargée par COMPLIANCE_CONTACT_EMAIL (arbitrage fondateur en attente).
   */
  private readonly messageRefus = messageAvoirsGeles(
    process.env.COMPLIANCE_CONTACT_EMAIL ?? 'compliance@beown.fr',
  );

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly auditLog: AuditLogService,
  ) {
    super();
  }

  /** Garde unique des quatre chemins d'argent sortant. */
  async assertAvoirsNonGeles(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { userId },
      select: ['userId', 'avoirsGelesLe'],
    });
    // Utilisateur inconnu : rien à geler — les gardes aval (404/403 métier)
    // restent responsables de leur propre refus.
    if (!user || user.avoirsGelesLe == null) return;

    this.logger.warn(
      `Opération refusée — avoirs gelés : userId=${userId} (gelé le ${user.avoirsGelesLe.toISOString?.() ?? user.avoirsGelesLe})`,
    );
    // Trace de la tentative (journal d'audit, 5 ans — barème ligne 9),
    // best-effort : l'échec de l'audit ne change pas le refus.
    await this.auditLog
      .create(
        String(userId),
        UserRole.INVESTISSEUR,
        'aml.gel.operation-refusee',
        'user',
        String(userId),
      )
      .catch(() => {});

    throw new ForbiddenException({
      code: CODE_AVOIRS_GELES,
      message: this.messageRefus,
    });
  }

  /** Pose le gel — acte humain, motif obligatoire (contrôlé par le DTO). */
  async geler(
    targetUserId: number,
    motif: string,
    admin: { userId: number; role?: string },
  ): Promise<{ userId: number; avoirsGelesLe: Date; avoirsGelesMotif: string }> {
    const user = await this.userRepo.findOne({ where: { userId: targetUserId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    // Idempotent : re-geler un compte déjà gelé conserve la date d'origine
    // (le point de départ juridique de la mesure ne se réécrit pas).
    const avoirsGelesLe = user.avoirsGelesLe ?? new Date();
    await this.userRepo.update(
      { userId: targetUserId },
      { avoirsGelesLe, avoirsGelesMotif: motif },
    );

    await this.auditLog
      .create(
        String(admin.userId),
        admin.role ?? UserRole.COMPLIANCE,
        'aml.gel.geler',
        'user',
        String(targetUserId),
        undefined,
        undefined,
        { motif },
      )
      .catch(() => {});

    this.logger.warn(
      `Avoirs gelés : userId=${targetUserId} par admin=${admin.userId}`,
    );
    return { userId: targetUserId, avoirsGelesLe, avoirsGelesMotif: motif };
  }

  /** Lève le gel — acte humain, audité. */
  async degeler(
    targetUserId: number,
    admin: { userId: number; role?: string },
  ): Promise<{ userId: number; avoirsGelesLe: null }> {
    const user = await this.userRepo.findOne({ where: { userId: targetUserId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    await this.userRepo.update(
      { userId: targetUserId },
      { avoirsGelesLe: null, avoirsGelesMotif: null },
    );

    await this.auditLog
      .create(
        String(admin.userId),
        admin.role ?? UserRole.COMPLIANCE,
        'aml.gel.degeler',
        'user',
        String(targetUserId),
        undefined,
        undefined,
        { motifPrecedent: user.avoirsGelesMotif ?? null },
      )
      .catch(() => {});

    this.logger.log(
      `Avoirs dégelés : userId=${targetUserId} par admin=${admin.userId}`,
    );
    return { userId: targetUserId, avoirsGelesLe: null };
  }

  /** Comptes actuellement gelés (vue admin compliance). */
  async listerComptesGeles(): Promise<
    Array<{
      userId: number;
      firstname: string | null;
      lastname: string | null;
      avoirsGelesLe: Date;
      avoirsGelesMotif: string | null;
    }>
  > {
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.userId AS "userId"',
        'u.firstname AS "firstname"',
        'u.lastname AS "lastname"',
        'u.avoirsGelesLe AS "avoirsGelesLe"',
        'u.avoirsGelesMotif AS "avoirsGelesMotif"',
      ])
      .where('u.avoirsGelesLe IS NOT NULL')
      .orderBy('u.avoirsGelesLe', 'DESC')
      .getRawMany();
    return rows;
  }
}
