import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * Rétractation d'un investissement pendant le délai légal de 4 jours (droit de
 * rétractation PSFP, investisseur non-averti uniquement).
 *
 * Correctif H-B (double-remboursement) — tout le règlement vit dans UNE
 * transaction DB :
 *  1. verrou pessimiste sur la ligne investissement (sérialise les requêtes
 *     concurrentes de rétractation sur le même investissement) ;
 *  2. transition d'état CONDITIONNELLE `CONFIRME → RETRACTE` via un UPDATE
 *     gardé (`WHERE statut = 'confirme'`) dont on vérifie `affected === 1`
 *     AVANT de rembourser ;
 *  3. recrédit ATOMIQUE du wallet (`solde + :montant` en SQL) + trace ledger.
 *
 * Deux appels concurrents ne peuvent donc plus rembourser deux fois : le
 * second attend le verrou puis voit un statut déjà `RETRACTE` (0 ligne
 * affectée) et est rejeté sans effet de bord financier.
 */
@Injectable()
export class CancelInvestmentUseCase {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async execute(investmentId: string, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Verrou pessimiste sur l'investissement — sérialise les rétractations
      //    concurrentes sur la même ligne.
      const inv = await manager.findOne(InvestmentEntity, {
        where: { id: investmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) throw new NotFoundException('Investissement introuvable');
      if (inv.utilisateurId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez annuler que vos propres investissements',
        );
      }
      if (inv.statut !== InvestmentStatus.CONFIRME) {
        throw new BadRequestException(
          `Investissement au statut "${inv.statut}" non annulable`,
        );
      }
      if (!inv.delaiRetractationJusquAu) {
        throw new BadRequestException(
          "Cet investissement n'a pas de délai de rétractation (vous êtes investisseur averti ou professionnel)",
        );
      }
      if (new Date() > new Date(inv.delaiRetractationJusquAu)) {
        throw new BadRequestException('Le délai de rétractation de 4 jours est dépassé');
      }

      // 2. Transition d'état CONDITIONNELLE — claim atomique. Si une requête
      //    concurrente a déjà rétracté (affected === 0), on abandonne sans
      //    rembourser.
      const claim = await manager
        .createQueryBuilder()
        .update(InvestmentEntity)
        .set({ statut: InvestmentStatus.RETRACTE })
        .where('id = :id AND statut = :confirme', {
          id: investmentId,
          confirme: InvestmentStatus.CONFIRME,
        })
        .execute();
      if (!claim.affected) {
        throw new BadRequestException('Investissement déjà rétracté ou non annulable');
      }

      // 3. Recrédit ATOMIQUE du wallet investisseur.
      const montant = Number(inv.montant);
      const wallet = await manager.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new NotFoundException('Wallet introuvable');

      await manager
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde + :montant' })
        .setParameter('montant', montant)
        .where('id = :id', { id: wallet.id })
        .execute();

      // Trace ledger du remboursement de rétractation (idempotent par
      // investissement : la contrainte unique verrouille tout doublon).
      await manager.save(
        TransactionEntity,
        manager.create(TransactionEntity, {
          walletDestination: wallet.id,
          type: TransactionType.REMBOURSEMENT_CAPITAL,
          montant,
          devise: wallet.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: inv.id,
          projetId: inv.projetId,
          idempotencyKey: `retract:${inv.id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: { kind: 'retractation', userId },
        }),
      );
    });
  }
}
