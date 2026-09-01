import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EcheanceEntity } from '../../infrastructure/persistences/entities/echeance.entity';
import { EcheanceStatus } from '../../domains/enums/investment-status.enum';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';
import { AuditLogService } from 'src/notifications/applications/audit-log.service';
import { UserRole } from 'src/iam/domains/enums/user.enum';
import { MetricsPort } from 'src/observability/metrics/metrics.port';
import { METRIC } from 'src/observability/metrics/metric-names';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';

/** Statuts d'échéance depuis lesquels un paiement est légitime. */
const PAYABLE_STATUSES: EcheanceStatus[] = [
  EcheanceStatus.A_VENIR,
  EcheanceStatus.RETARD,
  EcheanceStatus.RETARD_LEGER,
  EcheanceStatus.RETARD_SIGNIFICATIF,
  EcheanceStatus.EN_ATTENTE_PAIEMENT,
];

@Injectable()
export class PayEcheanceUseCase {
  private readonly logger = new Logger(PayEcheanceUseCase.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationEvents: NotificationEventService,
    private readonly auditLog: AuditLogService,
    private readonly metrics: MetricsPort,
    /**
     * Contrepartie DÉBITRICE du règlement. Le portefeuille technique du projet
     * est le seul endroit d'où l'argent d'une échéance peut légitimement
     * venir : il est alimenté par le porteur (`APPORT_PORTEUR`), et c'est lui
     * qui se vide quand la dette est servie.
     */
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
  ) {}

  /**
   * Paiement d'une échéance (intérêts + capital) avec prélèvement du PFU 30 %
   * vers les wallets séquestres IR/CSG.
   *
   * Correctif H-C (double-crédit au retry du CRON) — tout le règlement est
   * ATOMIQUE :
   *  1. dans une transaction DB, on CLAIME d'abord l'échéance via une
   *     transition d'état conditionnelle (`WHERE statut IN (payables)`,
   *     `affected === 1`) AVANT tout crédit ;
   *  2. les wallets (investisseur + séquestres IR/CSG) sont crédités par SQL
   *     ATOMIQUE (`solde + :x`), plus de read-modify-write ;
   *  3. les 3 traces ledger (net, IR, CSG) sont insérées dans la même
   *     transaction.
   *
   * Une panne partielle annule TOUT (rollback) → l'échéance reste payable et
   * le prochain run du CRON peut la rejouer sans double-créditer. Un succès
   * committe l'échéance en `PAYE`, qui n'est plus payable → idempotent.
   */
  async execute(
    echeanceId: string,
    adminId: number,
    adminRole?: string,
    // Origine du règlement, pour le label `source` de `echeance_settlements_total`.
    // Optionnel et rétrocompatible : les appelants existants (route admin
    // `/pay`) restent en "admin" par défaut.
    source: 'admin' | 'cron' | 'trigger_masse' = 'admin',
  ): Promise<EcheanceEntity> {
    const settled = await this.dataSource.transaction(async (em) => {
      const echeance = await em.findOne(EcheanceEntity, {
        where: { id: echeanceId },
        relations: ['investissement', 'investissement.projet'],
      });
      if (!echeance) throw new NotFoundException('Échéance introuvable');

      if (!PAYABLE_STATUSES.includes(echeance.statut as EcheanceStatus)) {
        throw new BadRequestException(
          `Échéance au statut "${echeance.statut}" non payable`,
        );
      }

      const userId = (echeance as any).investissement.utilisateurId;
      const project = (echeance as any).investissement.projet;
      const projetId = (echeance as any).investissement.projetId;

      // ── PFU (Prélèvement Forfaitaire Unique 30%) ───────────────────────────
      // IR 12,8 % + CSG/CRDS 17,2 % appliqués sur les intérêts uniquement.
      const interets = Number(echeance.montantInterets);
      const prelevementIR = Math.round(interets * 0.128 * 100) / 100;
      const prelevementCSG = Math.round(interets * 0.172 * 100) / 100;
      const montantNet = Number(echeance.montantTotal) - prelevementIR - prelevementCSG;

      // 1. CLAIM atomique — transition d'état conditionnelle AVANT tout crédit.
      const payeLe = new Date();
      const claim = await em
        .createQueryBuilder()
        .update(EcheanceEntity)
        .set({
          statut: EcheanceStatus.PAYE,
          payeLe,
          statutChangeLe: payeLe,
          prelevementIR,
          prelevementCSG,
        })
        .where('id = :id AND statut IN (:...payables)', {
          id: echeanceId,
          payables: PAYABLE_STATUSES,
        })
        .execute();
      if (!claim.affected) {
        // Un run concurrent a déjà payé cette échéance.
        throw new BadRequestException('Échéance déjà payée ou non payable');
      }

      // 2. DÉBIT de la contrepartie : le portefeuille technique du projet.
      //    C'est l'écriture qui manquait — sans elle, les trois crédits
      //    ci-dessous fabriquaient des euros que la trésorerie ne couvrait pas,
      //    et l'écart n'apparaissait qu'au rapprochement PSP du lendemain.
      //    Le débit porte le montant BRUT (net + IR + CSG) : la retenue
      //    fiscale sort bien de la poche du projet, elle est seulement
      //    consignée ailleurs que chez l'investisseur.
      const walletProjet = await this.projectWalletResolver.executeInTransaction(
        em,
        projetId,
      );
      const montantBrut = Number(echeance.montantTotal);
      await this.debitAtomic(em, walletProjet.id, montantBrut, {
        projetId,
        echeanceId,
      });

      // 3. Crédit ATOMIQUE du wallet investisseur (net).
      const wallet = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new NotFoundException('Wallet investisseur introuvable');
      await this.creditAtomic(em, wallet.id, montantNet);

      // 4. Séquestres fiscaux (créés à la première utilisation) — crédit atomique.
      const walletIR = await this.findOrCreateSequestre(
        em,
        WalletType.SEQUESTRE_IR,
        'SEQUESTRE-IR',
        wallet.devise,
      );
      await this.creditAtomic(em, walletIR.id, prelevementIR);

      const walletCSG = await this.findOrCreateSequestre(
        em,
        WalletType.SEQUESTRE_CSG,
        'SEQUESTRE-CSG',
        wallet.devise,
      );
      await this.creditAtomic(em, walletCSG.id, prelevementCSG);

      // 5. Traces ledger (net investisseur + IR + CSG), idempotency-keyées.
      //    Les trois portent la MÊME source — le portefeuille du projet — de
      //    sorte que « Σ crédits − Σ débits » se rapproche exactement du solde
      //    de chaque portefeuille (contrôle quotidien du grand livre).
      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: walletProjet.id,
        walletDestination: wallet.id,
        type: TransactionType.PAIEMENT_INTERETS,
        montant: montantNet,
        devise: wallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        echeanceId: echeance.id,
        investissementId: echeance.investissementId,
        projetId,
        idempotencyKey: `echeance:pay:${echeance.id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      }));

      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: walletProjet.id,
        walletDestination: walletIR.id,
        type: TransactionType.IMPOTS,
        montant: prelevementIR,
        devise: wallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        echeanceId: echeance.id,
        investissementId: echeance.investissementId,
        projetId,
        idempotencyKey: `echeance:ir:${echeance.id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      }));

      await em.save(TransactionEntity, em.create(TransactionEntity, {
        walletSource: walletProjet.id,
        walletDestination: walletCSG.id,
        type: TransactionType.IMPOTS,
        montant: prelevementCSG,
        devise: wallet.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        echeanceId: echeance.id,
        investissementId: echeance.investissementId,
        projetId,
        idempotencyKey: `echeance:csg:${echeance.id}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
      }));

      // Reflète l'état payé sur l'entité renvoyée (relations déjà chargées).
      echeance.statut = EcheanceStatus.PAYE;
      echeance.payeLe = payeLe;
      echeance.statutChangeLe = payeLe;
      echeance.prelevementIR = prelevementIR;
      echeance.prelevementCSG = prelevementCSG;

      return { echeance, project, montantNet, prelevementIR, prelevementCSG };
    });

    // ── Effets de bord APRÈS commit (non bloquants pour le règlement) ────────
    try {
      await this.notificationEvents.echeancePaid(settled.echeance, settled.project);
    } catch {
      // notification non bloquante
    }
    await this.auditLog
      .create(
        String(adminId),
        adminRole ?? UserRole.SUPER_ADMIN,
        'echeance.pay',
        'echeance',
        settled.echeance.id,
        undefined,
        undefined,
        {
          montantNet: settled.montantNet,
          prelevementIR: settled.prelevementIR,
          prelevementCSG: settled.prelevementCSG,
          projetId: settled.project?.id,
        },
      )
      .catch(() => undefined);

    this.metrics.incrementCounter(METRIC.ECHEANCE_SETTLEMENTS_TOTAL, { source });
    this.metrics.observeHistogram(
      METRIC.ECHEANCE_SETTLEMENT_AMOUNT_EUR,
      Number(settled.echeance.montantTotal),
      { component: 'brut' },
    );
    this.metrics.observeHistogram(
      METRIC.ECHEANCE_SETTLEMENT_AMOUNT_EUR,
      settled.montantNet,
      { component: 'net' },
    );
    this.metrics.observeHistogram(
      METRIC.ECHEANCE_SETTLEMENT_AMOUNT_EUR,
      settled.prelevementIR + settled.prelevementCSG,
      { component: 'pfu' },
    );

    return settled.echeance;
  }

  /** Crédit atomique d'un wallet (no-op si delta nul). */
  private async creditAtomic(
    em: EntityManager,
    walletId: string,
    amount: number,
  ): Promise<void> {
    if (!amount) return;
    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde + :amount' })
      .setParameter('amount', amount)
      .where('id = :id', { id: walletId })
      .execute();
  }

  /**
   * Débit atomique du portefeuille du projet, INCONDITIONNEL et assumé comme
   * tel.
   *
   * Pourquoi ne pas refuser quand le solde est insuffisant : le règlement d'une
   * échéance est une obligation contractuelle envers des investisseurs, pas une
   * dépense discrétionnaire. Bloquer le paiement transformerait un défaut
   * d'alimentation du porteur — son problème — en impayé pour l'investisseur —
   * le problème de la plateforme. On paie, et on rend le découvert VISIBLE :
   * c'est aussi la règle déjà retenue pour le remboursement de collecte
   * (`refund-collecte.service.ts`), et pour les mêmes raisons.
   *
   * Le découvert n'est donc pas une erreur silencieuse : il est journalisé en
   * avertissement, compté dans `PROJECT_WALLET_SHORTFALL_EUR` — l'alerte se
   * déclenche donc à l'instant du règlement, sans attendre le rapprochement
   * quotidien — et il apparaît dans l'état financier du projet.
   *
   * La lecture du solde `avant` est faite sous le verrou du portefeuille (déjà
   * détenu : le résolveur le verrouille), donc exacte au moment du débit.
   */
  private async debitAtomic(
    em: EntityManager,
    walletId: string,
    amount: number,
    contexte: { projetId: string; echeanceId: string },
  ): Promise<void> {
    if (!amount) return;

    const avant = await em.findOne(WalletEntity, { where: { id: walletId } });
    const soldeApres = Number(avant?.solde ?? 0) - amount;

    await em
      .createQueryBuilder()
      .update(WalletEntity)
      .set({ solde: () => 'solde - :amount' })
      .setParameter('amount', amount)
      .where('id = :id', { id: walletId })
      .execute();

    if (soldeApres < 0) {
      this.logger.warn(
        `Portefeuille projet ${walletId} en découvert de ${Math.abs(soldeApres).toFixed(2)} € ` +
        `après règlement de l'échéance ${contexte.echeanceId} (projet ${contexte.projetId}). ` +
        'Le projet doit être alimenté par son porteur.',
      );
      this.metrics.setGauge(
        METRIC.PROJECT_WALLET_SHORTFALL_EUR,
        Math.abs(soldeApres),
      );
    }
  }

  /** Récupère (ou crée) un wallet séquestre system-wide. */
  private async findOrCreateSequestre(
    em: EntityManager,
    type: WalletType,
    fournisseurRef: string,
    devise: string,
  ): Promise<WalletEntity> {
    const existing = await em.findOne(WalletEntity, { where: { type } });
    if (existing) return existing;
    return em.save(
      WalletEntity,
      em.create(WalletEntity, {
        type,
        proprietaireUserId: null,
        fournisseurRef,
        devise,
        solde: 0,
      }),
    );
  }
}
