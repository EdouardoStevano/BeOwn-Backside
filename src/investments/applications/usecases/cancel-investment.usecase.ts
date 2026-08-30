import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import {
  DELAI_RETRACTATION_JOURS,
  retractationOuverte,
} from 'src/investments/domains/retractation';
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
      if (inv.statut !== InvestmentStatus.EN_DELAI_RETRACTATION) {
        throw new BadRequestException(
          `Investissement au statut "${inv.statut}" non annulable`,
        );
      }
      if (!inv.delaiRetractationJusquAu) {
        throw new BadRequestException(
          "Cet investissement n'a pas de délai de rétractation : il est réservé aux investisseurs non avertis (art. 22 du règlement (UE) 2020/1503).",
        );
      }
      if (!retractationOuverte(inv.delaiRetractationJusquAu, new Date())) {
        throw new BadRequestException(
          `Le délai de rétractation de ${DELAI_RETRACTATION_JOURS} jours est dépassé`,
        );
      }

      // 2. Transition d'état CONDITIONNELLE — claim atomique. Si une requête
      //    concurrente a déjà rétracté (affected === 0), on abandonne sans
      //    rembourser.
      const claim = await manager
        .createQueryBuilder()
        .update(InvestmentEntity)
        .set({ statut: InvestmentStatus.RETRACTE })
        .where('id = :id AND statut = :enAttente', {
          id: investmentId,
          enAttente: InvestmentStatus.EN_DELAI_RETRACTATION,
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

      // Le montant vivait sur `soldeBloque` depuis la souscription : la
      // rétractation le rend disponible « sans pénalité » (art. 22(3)), donc
      // sans aucune retenue de frais.
      await manager
        .createQueryBuilder()
        .update(WalletEntity)
        .set({
          solde: () => 'solde + :montant',
          soldeBloque: () => 'GREATEST(0, "soldeBloque" - :montant)',
        })
        .setParameter('montant', montant)
        .where('id = :id', { id: wallet.id })
        .execute();

      // Trace ledger du remboursement de rétractation (idempotent par
      // investissement : la contrainte unique verrouille tout doublon).
      // GRAND LIVRE — les fonds n'avaient jamais quitté le wallet de
      // l'investisseur : ils étaient sur sa poche bloquée (art. 22). La
      // rétractation est donc un mouvement INTERNE au wallet (bloqué →
      // disponible) : source = destination, somme des fonds détenus conservée.
      await manager.save(
        TransactionEntity,
        manager.create(TransactionEntity, {
          walletSource: wallet.id,
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
