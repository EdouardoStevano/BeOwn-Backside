import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { UserStatus } from 'src/iam/domains/enums/user.enum';
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
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { EmailTemplateService } from 'src/shared/email/email-template.service';
import { EMAIL_SERVICE } from 'src/shared/email/email.service';
import type { EmailService } from 'src/shared/email/email.service';
import { hasPermission } from 'src/common/auth/permissions.constants';
import { AnonymizeAccountService } from 'src/rgpd/applications/anonymize-account.service';
import { formatEur } from 'src/shared/money/format-eur';
import {
  AccountDeletionBlockedError,
  AccountDeletionNotAllowedError,
  UserNotFoundError,
} from 'src/iam/domains/errors';

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
  InvestmentStatus.EN_DELAI_RETRACTATION,
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

/** Résultat de la tentative de retrait automatique du solde (atomique). */
type WithdrawalOutcome =
  | { result: 'created'; montant: number }
  | { result: 'already_pending'; montant: number }
  | { result: 'no_balance'; montant: number };

/** Violation de contrainte unique Postgres (clé d'idempotence déjà présente). */
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as unknown as { code?: string }).code === '23505'
  );
}

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly notificationEvents: NotificationEventService,
    private readonly templates: EmailTemplateService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
    // EN DERNIÈRE POSITION (convention du dépôt : les specs construisent à la
    // main) — anonymisation RGPD post-suppression (lot 2, mission 3).
    private readonly anonymizeAccount: AnonymizeAccountService,
  ) {}

  async execute(userId: number, initiator: DeletionInitiator): Promise<void> {
    // Un admin (users:delete — super_admin via wildcard) ne peut pas supprimer
    // son propre compte : évite de perdre le dernier super admin.
    if (
      initiator.userId === userId &&
      hasPermission(initiator.role, 'users:delete')
    ) {
      throw new AccountDeletionNotAllowedError(
        'Un administrateur ne peut pas supprimer son propre compte.',
      );
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new UserNotFoundError('Utilisateur introuvable.');

    // Idempotence : un compte déjà supprimé est un no-op de succès — aucun
    // second email ni seconde notification (le chemin admin ne pré-filtre pas
    // le statut de la cible, un rejeu doit rester inoffensif).
    if (user.status === UserStatus.SUPPRIME) return;

    // Verrou mutuel : on n'autorise pas la suppression d'un compte qui détient
    // lui-même `users:delete` (autre super_admin) — évite qu'un admin en
    // supprime un autre et prive la plateforme de ses administrateurs.
    if (hasPermission(user.role, 'users:delete')) {
      throw new AccountDeletionNotAllowedError(
        'Impossible de supprimer un administrateur.',
      );
    }

    const blockers: DeletionBlocker[] = [];

    // ── Investissements actifs / souscriptions en cours ─────────────────────
    const activeInvestments = await this.investRepo.count({
      where: {
        utilisateurId: userId,
        statut: In(BLOCKING_INVESTMENT_STATUSES),
      },
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
    // Lecture « sale » (hors verrou) uniquement pour décider s'il y a matière
    // à traiter et récupérer l'IBAN. La décision et le débit qui font foi ont
    // lieu sous verrou pessimiste dans createFullBalanceWithdrawal.
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    const solde = wallet ? Number(wallet.solde) : 0;
    if (wallet && solde > 0) {
      const iban = await this.findRegisteredIban(wallet.id);
      if (!iban) {
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
      } else {
        const outcome = await this.createFullBalanceWithdrawal(
          userId,
          wallet.id,
          solde,
          iban,
        );
        if (outcome.result === 'created') {
          blockers.push({
            code: 'WALLET_BALANCE',
            withdrawalCreated: true,
            message: `Le versement de votre solde (${formatEur(outcome.montant)}) a été déclenché automatiquement — la suppression aboutira une fois le virement traité.`,
          });
        } else if (outcome.result === 'already_pending') {
          // Garde anti-doublon : un versement attend déjà son traitement.
          blockers.push({
            code: 'WALLET_BALANCE',
            withdrawalCreated: true,
            message: `Le versement de votre solde (${formatEur(outcome.montant)}) est déjà en cours de traitement — la suppression aboutira une fois le virement traité.`,
          });
        }
        // 'no_balance' : le solde a été drainé entre-temps (race) et aucun
        // versement n'est en attente — plus rien à bloquer côté portefeuille.
      }
    }

    if (blockers.length > 0) {
      throw new AccountDeletionBlockedError(blockers);
    }

    // ── Aucun bloqueur : soft-delete + notifications ────────────────────────
    user.status = UserStatus.SUPPRIME;
    await this.userRepo.save(user);

    // L'email d'adieu part AVANT l'anonymisation : dernier usage légitime de
    // l'adresse (elle est écrasée juste après).
    await this.notifyAccountDeleted(user, initiator);

    // ── Anonymisation RGPD (barème lot 2, §2) — APRÈS le soft-delete réussi ─
    // Résiliente : un échec ici ne doit pas transformer une suppression
    // aboutie en 500 (le compte EST supprimé). Le cron de purge quotidien
    // rattrape tout compte SUPPRIME resté non anonymisé (finalité
    // `compte_supprime_a_anonymiser`), et l'opération est idempotente.
    try {
      await this.anonymizeAccount.anonymiser(userId);
    } catch (err) {
      this.logger.error(
        `Anonymisation RGPD échouée (user ${userId}) — le cron de purge la rattrapera : ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );
    }
  }

  /**
   * IBAN « enregistré » de l'utilisateur : les coordonnées bancaires ne sont
   * pas stockées en profil — la seule source persistée est l'ibanDestination
   * de sa demande de retrait la plus récente (fournisseurRef / metadata de la
   * transaction RETRAIT, voir POST /payments/retrait).
   */
  private async findRegisteredIban(walletId: string): Promise<string | null> {
    const lastRetrait = await this.txRepo.findOne({
      // ANO-02 : un retrait débite le portefeuille → il vit sur `walletSource`.
      where: { walletSource: walletId, type: TransactionType.RETRAIT },
      order: { createdAt: 'DESC' },
    });
    if (!lastRetrait) return null;
    const metaIban = (
      lastRetrait.metadata as { ibanDestination?: string } | null
    )?.ibanDestination;
    return metaIban ?? lastRetrait.fournisseurRef ?? null;
  }

  /**
   * Retrait automatique du solde total, ATOMIQUE (corrige un TOCTOU de double
   * paiement). Même flux fonctionnel que POST /payments/retrait (transaction
   * RETRAIT en_attente_paiement + débit du wallet + alerte financière), mais
   * l'ensemble « lecture du solde → contrôle anti-doublon → écriture tx →
   * débit » vit dans UNE seule transaction avec verrou pessimiste sur la ligne
   * wallet (SELECT … FOR UPDATE). Deux DELETE concurrents sont ainsi
   * sérialisés : le second acquiert le verrou après commit du premier, relit
   * un solde à 0 (ou voit le retrait déjà en attente) et ne double ni la
   * transaction ni le débit. Défense en profondeur : clé d'idempotence
   * DÉTERMINISTE `retrait:suppression:<userId>` — la contrainte unique bloque
   * un second retrait de suppression même hors fenêtre de course.
   *
   * `dirtySolde` (lecture hors verrou) ne sert que de repli d'affichage si la
   * course est perdue avant la lecture verrouillée ; le montant qui fait foi
   * est toujours le solde relu sous verrou.
   */
  private async createFullBalanceWithdrawal(
    userId: number,
    walletId: string,
    dirtySolde: number,
    iban: string,
  ): Promise<WithdrawalOutcome> {
    const idempotencyKey = `retrait:suppression:${userId}`;
    let outcome: WithdrawalOutcome;
    let createdTxId: string | null = null;
    let versedMontant = 0;
    let devise = 'EUR';

    try {
      outcome = await this.dataSource.transaction(async (manager) => {
        const wallet = await manager.findOne(WalletEntity, {
          where: { id: walletId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!wallet) return { result: 'no_balance', montant: 0 };
        devise = wallet.devise ?? 'EUR';

        // Anti-doublon sous verrou : un versement en attente existe déjà.
        const pending = await manager.findOne(TransactionEntity, {
          where: {
            walletSource: walletId,
            type: TransactionType.RETRAIT,
            statut: In(PENDING_RETRAIT_STATUSES),
          },
        });
        if (pending) {
          return {
            result: 'already_pending',
            montant: Number(pending.montant),
          };
        }

        // Re-vérification du solde SOUS VERROU (cf. payment.controller:217) :
        // le montant versé est le solde verrouillé, jamais la lecture sale.
        const soldeVerrouille = Number(wallet.solde);
        if (soldeVerrouille <= 0) {
          return { result: 'no_balance', montant: 0 };
        }

        const tx = await manager.save(
          TransactionEntity,
          manager.create(TransactionEntity, {
            walletSource: walletId,
            walletDestination: null,
            type: TransactionType.RETRAIT,
            montant: soldeVerrouille,
            devise,
            statut: TransactionStatus.EN_ATTENTE_PAIEMENT,
            fournisseur: TransactionFournisseur.STRIPE,
            fournisseurRef: iban,
            idempotencyKey,
            metadata: { ibanDestination: iban, source: 'suppression_compte' },
          }),
        );

        // Débit dans la MÊME transaction : si l'une des deux écritures échoue,
        // tout est annulé (plus d'échec partiel tx-sans-débit).
        wallet.solde = 0;
        await manager.save(WalletEntity, wallet);

        createdTxId = tx.id;
        versedMontant = soldeVerrouille;
        return { result: 'created', montant: soldeVerrouille };
      });
    } catch (err) {
      // Collision de clé d'idempotence (retrait de suppression déjà émis) :
      // traité comme un versement déjà en cours — jamais un second débit.
      if (isUniqueViolation(err)) {
        return { result: 'already_pending', montant: dirtySolde };
      }
      throw err;
    }

    // Alerte financière hors transaction (best-effort) uniquement si un retrait
    // vient réellement d'être créé.
    if (outcome.result === 'created') {
      this.notifications
        .pushToAdmins({
          type: NotificationType.RETRAIT_TRAITE,
          titre: 'Nouvelle demande de retrait',
          message: `Retrait automatique du solde (${formatEur(versedMontant)}) de l'utilisateur #${userId} vers ${iban}, déclenché par sa demande de suppression de compte.`,
          roles: [UserRole.SUPER_ADMIN, UserRole.FINANCIER],
          metadata: {
            userId,
            transactionId: createdTxId,
            amount: versedMontant,
            currency: devise,
            ibanDestination: iban,
            source: 'suppression_compte',
          },
        })
        .catch(() => {});
    }

    return outcome;
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
