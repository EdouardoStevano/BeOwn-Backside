import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  UserEntity,
  UserStatus,
} from 'src/users/infrastructure/persistences/entities/user.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { OrdreMarcheEntity } from 'src/secondarymarket/infrastructure/persistences/entities/ordre-marche.entity';
import { OrdreMarcheStatus } from 'src/secondarymarket/domains/ordre-marche';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationService } from 'src/notifications/applications/notification.service';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { NotificationType } from 'src/notifications/infrastructure/persistences/entities/notification.entity';
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';
import { EmailTemplateService } from 'src/common/email/email-template.service';
import { EMAIL_SERVICE } from 'src/common/email/email.service';
import type { EmailService } from 'src/common/email/email.service';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { formatEur } from 'src/common/money/format-eur';

/** Qui demande la suppression : l'utilisateur lui-même ou un admin. */
export interface DeletionInitiator {
  userId: number;
  role: string;
}

export interface DeletionBlocker {
  code: 'ACTIVE_INVESTMENTS' | 'OPEN_ORDERS' | 'WALLET_BALANCE' | 'NO_IBAN';
  message: string;
  /** Uniquement sur WALLET_BALANCE : un retrait du solde a-t-il été déclenché ? */
  withdrawalCreated?: boolean;
}

/**
 * Statuts d'investissement bloquant la suppression : engagement financier en
 * cours (position active ou souscription dont le paiement peut encore aboutir).
 * - PAIEMENT_ATTENDU : un paiement asynchrone (Stripe) peut encore créditer la
 *   souscription — supprimer le compte orphelinerait les fonds.
 * - PAYE / SIGNE : souscription engagée dans une collecte en cours.
 * - CONFIRME : position active.
 * - REMBOURSE_CAPITAL : capital remboursé mais flux (intérêts/distributions)
 *   potentiellement restants.
 * Non bloquants : INITIE et ADEQUATION_OK (tunnel abandonné, aucun fonds
 * engagé), RETRACTE, ANNULE, REMBOURSE_TOTAL (terminaux, position soldée).
 */
export const BLOCKING_INVESTMENT_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.PAIEMENT_ATTENDU,
  InvestmentStatus.PAYE,
  InvestmentStatus.SIGNE,
  InvestmentStatus.CONFIRME,
  InvestmentStatus.REMBOURSE_CAPITAL,
];

/** Statuts « ouverts » d'un ordre marché secondaire (ni exécuté, ni annulé, ni expiré). */
export const OPEN_ORDER_STATUSES: OrdreMarcheStatus[] = [
  OrdreMarcheStatus.EN_CARNET,
  OrdreMarcheStatus.MATCH_PROPOSE,
  OrdreMarcheStatus.ACCEPTE,
];

/** Statuts d'un retrait encore en attente de traitement (garde anti-doublon). */
const PENDING_RETRAIT_STATUSES: TransactionStatus[] = [
  TransactionStatus.INITIE,
  TransactionStatus.EN_ATTENTE_PAIEMENT,
  TransactionStatus.EN_COURS,
];

/**
 * Suppression de compte sous conditions (V2-T7).
 *
 * Évalue TOUS les bloqueurs et les renvoie ensemble en 409
 * `{ code: 'ACCOUNT_DELETION_BLOCKED', blockers: [...] }` (forme plate à la
 * racine du body — les fronts parsent d'abord cette forme). Si le seul
 * obstacle est un solde positif ET qu'un IBAN est connu, un retrait du solde
 * total est déclenché automatiquement (même flux que POST /payments/retrait :
 * transaction RETRAIT en_attente_paiement + débit du wallet + alerte admin),
 * puis le 409 est quand même renvoyé — la suppression n'est jamais partielle.
 *
 * Sans aucun bloqueur : soft-delete (statut SUPPRIME, rejeté ensuite par
 * AccountStatusGuard), notification in-app + email `compte-supprime` au
 * titulaire, et event `accountDeletedByUser` vers les rôles back-office.
 */
@Injectable()
export class DeleteAccountUseCase {
  private readonly logger = new Logger(DeleteAccountUseCase.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(InvestmentEntity)
    private readonly investRepo: Repository<InvestmentEntity>,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly notifications: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    private readonly templates: EmailTemplateService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  async execute(userId: number, initiator: DeletionInitiator): Promise<void> {
    // Un admin (users:delete — super_admin via wildcard) ne peut pas supprimer
    // son propre compte : évite de perdre le dernier super admin.
    if (
      initiator.userId === userId &&
      hasPermission(initiator.role, 'users:delete')
    ) {
      throw new BadRequestException(
        'Un administrateur ne peut pas supprimer son propre compte.',
      );
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const blockers: DeletionBlocker[] = [];

    // ── Investissements actifs / souscriptions en cours ─────────────────────
    const activeInvestments = await this.investRepo.count({
      where: { utilisateurId: userId, statut: In(BLOCKING_INVESTMENT_STATUSES) },
    });
    if (activeInvestments > 0) {
      blockers.push({
        code: 'ACTIVE_INVESTMENTS',
        message: `Vous détenez ${activeInvestments} investissement(s) actif(s) ou souscription(s) en cours. La suppression du compte ne sera possible qu'une fois vos positions soldées.`,
      });
    }

    // ── Ordres ouverts sur le marché secondaire (vente OU achat) ────────────
    const openOrders = await this.ordreRepo.count({
      where: [
        { vendeurId: userId, statut: In(OPEN_ORDER_STATUSES) },
        { acheteurId: userId, statut: In(OPEN_ORDER_STATUSES) },
      ],
    });
    if (openOrders > 0) {
      blockers.push({
        code: 'OPEN_ORDERS',
        message: `Vous avez ${openOrders} ordre(s) ouvert(s) sur le marché secondaire. Annulez-les ou attendez leur exécution avant de supprimer votre compte.`,
      });
    }

    // ── Solde du portefeuille ───────────────────────────────────────────────
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    const solde = wallet ? Number(wallet.solde) : 0;
    if (wallet && solde > 0) {
      const pendingRetrait = await this.txRepo.findOne({
        where: {
          walletId: wallet.id,
          type: TransactionType.RETRAIT,
          statut: In(PENDING_RETRAIT_STATUSES),
        },
      });
      if (pendingRetrait) {
        // Garde anti-doublon : un versement attend déjà son traitement.
        blockers.push({
          code: 'WALLET_BALANCE',
          withdrawalCreated: true,
          message: `Le versement de votre solde (${formatEur(solde)}) est déjà en cours de traitement — la suppression aboutira une fois le virement traité.`,
        });
      } else {
        const iban = await this.findRegisteredIban(wallet.id);
        if (iban) {
          await this.createFullBalanceWithdrawal(userId, wallet, solde, iban);
          blockers.push({
            code: 'WALLET_BALANCE',
            withdrawalCreated: true,
            message: `Le versement de votre solde (${formatEur(solde)}) a été déclenché automatiquement — la suppression aboutira une fois le virement traité.`,
          });
        } else {
          blockers.push({
            code: 'WALLET_BALANCE',
            withdrawalCreated: false,
            message: `Votre portefeuille présente un solde de ${formatEur(solde)} qui doit vous être versé avant la suppression.`,
          });
          blockers.push({
            code: 'NO_IBAN',
            message:
              'Renseignez vos coordonnées bancaires pour récupérer votre solde avant la suppression.',
          });
        }
      }
    }

    if (blockers.length > 0) {
      throw new ConflictException({
        code: 'ACCOUNT_DELETION_BLOCKED',
        blockers,
      });
    }

    // ── Aucun bloqueur : soft-delete + notifications ────────────────────────
    user.status = UserStatus.SUPPRIME;
    await this.userRepo.save(user);

    await this.notifyAccountDeleted(user, initiator);
  }

  /**
   * IBAN « enregistré » de l'utilisateur : les coordonnées bancaires ne sont
   * pas stockées en profil — la seule source persistée est l'ibanDestination
   * de sa demande de retrait la plus récente (fournisseurRef / metadata de la
   * transaction RETRAIT, voir POST /payments/retrait).
   */
  private async findRegisteredIban(walletId: string): Promise<string | null> {
    const lastRetrait = await this.txRepo.findOne({
      where: { walletId, type: TransactionType.RETRAIT },
      order: { createdAt: 'DESC' },
    });
    if (!lastRetrait) return null;
    const metaIban = (lastRetrait.metadata as { ibanDestination?: string } | null)
      ?.ibanDestination;
    return metaIban ?? lastRetrait.fournisseurRef ?? null;
  }

  /**
   * Même flux que POST /payments/retrait (payment.controller.ts) : transaction
   * RETRAIT en_attente_paiement, débit immédiat du wallet, alerte aux rôles
   * financiers pour traitement manuel. Reproduit ici car ce flux vit encore
   * inline dans le controller (non injectable).
   */
  private async createFullBalanceWithdrawal(
    userId: number,
    wallet: WalletEntity,
    montant: number,
    iban: string,
  ): Promise<void> {
    const idempotencyKey = `retrait:${userId}:${Date.now()}`;
    const tx = await this.txRepo.save(
      this.txRepo.create({
        walletId: wallet.id,
        type: TransactionType.RETRAIT,
        montant,
        devise: wallet.devise ?? 'EUR',
        statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
        fournisseur: TransactionFournisseur.STRIPE,
        fournisseurRef: iban,
        idempotencyKey,
        metadata: { ibanDestination: iban, source: 'suppression_compte' },
      }),
    );

    await this.walletRepo.decrement({ id: wallet.id }, 'solde', montant);

    this.notifications
      .pushToAdmins({
        type: NotificationType.RETRAIT_TRAITE,
        titre: 'Nouvelle demande de retrait',
        message: `Retrait automatique du solde (${formatEur(montant)}) de l'utilisateur #${userId} vers ${iban}, déclenché par sa demande de suppression de compte.`,
        roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
        metadata: {
          userId,
          transactionId: tx.id,
          amount: montant,
          currency: wallet.devise ?? 'EUR',
          ibanDestination: iban,
          source: 'suppression_compte',
        },
      })
      .catch(() => {});
  }

  /** Confirmation au titulaire (in-app + email) + event back-office existant. */
  private async notifyAccountDeleted(
    user: UserEntity,
    initiator: DeletionInitiator,
  ): Promise<void> {
    try {
      await this.notifications.push({
        utilisateurId: user.userId,
        type: NotificationType.COMPTE_SUPPRIME,
        titre: 'Compte supprimé',
        message:
          'Votre compte BeOwn a été supprimé. Merci de la confiance que vous nous avez accordée.',
        metadata: { initiatorId: initiator.userId },
      });
    } catch (err) {
      this.logger.warn(
        `Notification in-app de suppression échouée (user ${user.userId}) : ${(err as Error)?.message}`,
      );
    }

    const email = user.userEmail?.email;
    if (email) {
      try {
        const rendered = await this.templates.render('compte-supprime', {
          prenom: user.firstname ?? '',
        });
        if (!rendered) {
          this.logger.log(
            'Template email "compte-supprime" désactivé ou introuvable — envoi ignoré.',
          );
        } else if (this.emailService.sendTransactionalEmail) {
          await this.emailService.sendTransactionalEmail(
            email,
            rendered.sujet,
            rendered.html,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Email de suppression échoué (user ${user.userId}) : ${(err as Error)?.message}`,
        );
      }
    }

    this.notificationEvents.accountDeletedByUser(user);
  }
}
