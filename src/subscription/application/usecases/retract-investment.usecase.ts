import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { InvestmentOrmMapper } from 'src/subscription/infrastructure/persistence/mappers/investment.orm-mapper';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { InvestissementRetracteDomainEvent } from 'src/subscription/domain/events/investissement-retracte.domain-event';
import {
  InvestissementDejaRetracteError,
  InvestissementIntrouvableError,
  WalletIntrouvableError,
} from 'src/subscription/domain/errors/subscription.errors';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';

/**
 * **Se rétracter** — l'investisseur non-averti exerce son droit de
 * rétractation PSFP dans les 4 jours et se fait intégralement rembourser.
 *
 * Le use case orchestre, il ne décide pas (§14) : les quatre conditions de la
 * rétractation — être le titulaire, être `CONFIRME`, avoir une fenêtre, être
 * encore dedans — vivent dans {@link Investment.retracter}. Elles occupaient
 * ici quatre `if` en clair, entre un verrou pessimiste et un recrédit de
 * wallet.
 *
 * Nommé `retracter` et non `annuler` : ce sont deux transitions distinctes de
 * l'agrégat (§4). La rétractation est un droit de l'investisseur dans une
 * fenêtre légale ; l'annulation (RG-INV-11) est le remboursement décidé par la
 * plateforme quand la cible de collecte n'est pas atteinte. La classe
 * s'appelait `CancelInvestmentUseCase` alors qu'elle n'implémentait que la
 * première.
 *
 * L'atomicité du règlement (correctif H-B, double-remboursement) est
 * inchangée — c'est une propriété de la transaction, pas du modèle :
 *
 *  1. verrou pessimiste sur la ligne investissement (sérialise les
 *     rétractations concurrentes sur le même investissement) ;
 *  2. l'agrégat éprouve les règles, puis une transition CONDITIONNELLE
 *     `CONFIRME → RETRACTE` (`WHERE statut = 'confirme'`, `affected === 1`)
 *     rejoue la même décision en base AVANT tout remboursement ;
 *  3. recrédit ATOMIQUE du wallet (`solde + :montant` en SQL) + trace ledger.
 *
 * Deux appels concurrents ne peuvent donc pas rembourser deux fois : le second
 * attend le verrou, voit un statut déjà `RETRACTE` (0 ligne affectée) et est
 * rejeté sans effet de bord financier.
 */
@Injectable()
export class RetractInvestmentUseCase {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
  ) {}

  async execute(investmentId: string, userId: number): Promise<void> {
    const retracte = await this.dataSource.transaction(async (manager) => {
      // 1. Verrou pessimiste — sérialise les rétractations concurrentes.
      const row = await manager.findOne(InvestmentEntity, {
        where: { id: investmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new InvestissementIntrouvableError(investmentId);

      // 2. Le domaine tranche : titulaire, statut, fenêtre PSFP.
      const investment = InvestmentOrmMapper.toDomain(row);
      investment.retracter(userId);

      // 3. Claim atomique — si une requête concurrente a déjà rétracté
      //    (affected === 0), on abandonne sans rembourser.
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
        throw new InvestissementDejaRetracteError();
      }

      // 4. Recrédit ATOMIQUE du wallet investisseur.
      const montant = investment.montant;
      const wallet = await manager.findOne(WalletEntity, {
        where: { proprietaireUserId: userId, type: WalletType.INVESTISSEUR },
      });
      if (!wallet) throw new WalletIntrouvableError();

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
          investissementId: investment.id,
          projetId: investment.projetId,
          idempotencyKey: `retract:${investment.id}`,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: { kind: 'retractation', userId },
        }),
      );

      return investment;
    });

    this.eventBus.publish(
      new InvestissementRetracteDomainEvent(
        retracte.id,
        retracte.projetId,
        retracte.utilisateurId,
        retracte.montant,
      ),
    );
  }
}
