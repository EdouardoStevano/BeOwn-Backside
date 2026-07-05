import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { UserRole } from 'src/users/infrastructure/persistences/entities/user.entity';

@Injectable()
export class PayEcheanceUseCase {
  constructor(
    @InjectRepository(EcheanceEntity)
    private readonly echeanceRepo: Repository<EcheanceEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly notificationEvents: NotificationEventService,
    private readonly auditLog: AuditLogService,
  ) {}

  async execute(echeanceId: string, adminId: number): Promise<EcheanceEntity> {
    const echeance = await this.echeanceRepo.findOne({
      where: { id: echeanceId },
      relations: ['investissement', 'investissement.projet'],
    });
    if (!echeance) throw new NotFoundException('Échéance introuvable');

    const eligible = [EcheanceStatus.A_VENIR, EcheanceStatus.RETARD];
    if (!eligible.includes(echeance.statut as EcheanceStatus)) {
      throw new BadRequestException(`Échéance au statut "${echeance.statut}" non payable`);
    }

    const userId = (echeance as any).investissement.utilisateurId;
    const project = (echeance as any).investissement.projet;

    // ── PFU (Prélèvement Forfaitaire Unique 30%) ─────────────────────────────
    // IR: 12.8% of interest, CSG/CRDS: 17.2% of interest — applied on montantInterets only
    const interets = Number(echeance.montantInterets);
    const prelevementIR = Math.round(interets * 0.128 * 100) / 100;
    const prelevementCSG = Math.round(interets * 0.172 * 100) / 100;
    const montantNet = Number(echeance.montantTotal) - prelevementIR - prelevementCSG;

    // ── Investor wallet ──────────────────────────────────────────────────────
    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) throw new NotFoundException('Wallet investisseur introuvable');

    wallet.solde = Number(wallet.solde) + montantNet;
    await this.walletRepo.save(wallet);

    // ── Séquestre wallets (system-wide, created on first use) ────────────────
    let walletIR = await this.walletRepo.findOne({
      where: { type: WalletType.SEQUESTRE_IR },
    });
    if (!walletIR) {
      walletIR = await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.SEQUESTRE_IR,
          proprietaireUserId: null,
          fournisseurRef: 'SEQUESTRE-IR',
          devise: wallet.devise,
          solde: 0,
        }),
      );
    }
    walletIR.solde = Number(walletIR.solde) + prelevementIR;
    await this.walletRepo.save(walletIR);

    let walletCSG = await this.walletRepo.findOne({
      where: { type: WalletType.SEQUESTRE_CSG },
    });
    if (!walletCSG) {
      walletCSG = await this.walletRepo.save(
        this.walletRepo.create({
          type: WalletType.SEQUESTRE_CSG,
          proprietaireUserId: null,
          fournisseurRef: 'SEQUESTRE-CSG',
          devise: wallet.devise,
          solde: 0,
        }),
      );
    }
    walletCSG.solde = Number(walletCSG.solde) + prelevementCSG;
    await this.walletRepo.save(walletCSG);

    // ── Main transaction (net interest credited to investor) ─────────────────
    const tx = this.txRepo.create({
      walletDestination: wallet.id,
      type: TransactionType.PAIEMENT_INTERETS,
      montant: montantNet,
      devise: wallet.devise,
      statut: TransactionStatus.REUSSI,
      fournisseur: TransactionFournisseur.INTERNE,
      echeanceId: echeance.id,
      investissementId: echeance.investissementId,
      projetId: (echeance as any).investissement.projetId,
      idempotencyKey: `echeance:pay:${echeance.id}`,
      fraisPsp: 0,
      fraisPlateforme: 0,
    });
    await this.txRepo.save(tx);

    // ── Audit transactions for séquestre transfers ───────────────────────────
    const txIR = this.txRepo.create({
      walletDestination: walletIR.id,
      type: TransactionType.IMPOTS,
      montant: prelevementIR,
      devise: wallet.devise,
      statut: TransactionStatus.REUSSI,
      fournisseur: TransactionFournisseur.INTERNE,
      echeanceId: echeance.id,
      investissementId: echeance.investissementId,
      projetId: (echeance as any).investissement.projetId,
      idempotencyKey: `echeance:ir:${echeance.id}`,
      fraisPsp: 0,
      fraisPlateforme: 0,
    });
    await this.txRepo.save(txIR);

    const txCSG = this.txRepo.create({
      walletDestination: walletCSG.id,
      type: TransactionType.IMPOTS,
      montant: prelevementCSG,
      devise: wallet.devise,
      statut: TransactionStatus.REUSSI,
      fournisseur: TransactionFournisseur.INTERNE,
      echeanceId: echeance.id,
      investissementId: echeance.investissementId,
      projetId: (echeance as any).investissement.projetId,
      idempotencyKey: `echeance:csg:${echeance.id}`,
      fraisPsp: 0,
      fraisPlateforme: 0,
    });
    await this.txRepo.save(txCSG);

    // ── Persist fiscal fields + mark paid ────────────────────────────────────
    echeance.prelevementIR = prelevementIR;
    echeance.prelevementCSG = prelevementCSG;
    echeance.statut = EcheanceStatus.PAYE;
    echeance.payeLe = new Date();
    const saved = await this.echeanceRepo.save(echeance);

    await this.notificationEvents.echeancePaid(echeance, project);
    await this.auditLog.create(
      String(adminId),
      UserRole.SUPER_ADMIN,
      'echeance.pay',
      'echeance',
      echeance.id,
      undefined,
      undefined,
      { montantNet, prelevementIR, prelevementCSG, projetId: project?.id },
    );
    return saved;
  }
}
