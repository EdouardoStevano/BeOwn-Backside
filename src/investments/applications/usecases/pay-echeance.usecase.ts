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
    const montant = Number(echeance.montantTotal);

    const wallet = await this.walletRepo.findOne({
      where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
    });
    if (!wallet) throw new NotFoundException('Wallet investisseur introuvable');

    wallet.solde = Number(wallet.solde) + montant;
    await this.walletRepo.save(wallet);

    // Use PAIEMENT_INTERETS for écheance payment (interest payment)
    const tx = this.txRepo.create({
      walletDestination: wallet.id,
      type: TransactionType.PAIEMENT_INTERETS,
      montant,
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

    echeance.statut = EcheanceStatus.PAYE;
    echeance.payeLe = new Date();
    const saved = await this.echeanceRepo.save(echeance);

    await this.notificationEvents.echeancePaid(echeance, project);
    await this.auditLog.create(
      String(adminId),
      UserRole.ADMIN,
      'echeance.pay',
      'echeance',
      echeance.id,
      undefined,
      undefined,
      { montant, projetId: project?.id },
    );
    return saved;
  }
}
