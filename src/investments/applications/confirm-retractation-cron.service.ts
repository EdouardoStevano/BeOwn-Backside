import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { EcheanceEntity } from 'src/investments/infrastructure/persistences/entities/echeance.entity';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { InvestmentStatus, RemboursementMode } from 'src/investments/domains/enums/investment-status.enum';
import { ProjectStatus } from 'src/projects/domains/enums/project-status.enum';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { EcheanceStatus } from 'src/investments/domains/enums/investment-status.enum';
import { InvestmentMapper } from 'src/investments/infrastructure/persistences/mappers/investment.mapper';
import { Echeance } from 'src/investments/domains/echeance';
import { ResolveProjectWalletUseCase } from 'src/wallets/applications/usecases/resolve-project-wallet.usecase';

/**
 * Confirme les souscriptions dont le délai de réflexion accordé par BeOwn a
 * expiré. Durée : `DELAI_RETRACTATION_JOURS`, appliquée à la souscription par
 * `calculerEcheanceRetractation` ; ce service ne fait que lire l'échéance
 * persistée, il ne recalcule aucune durée.
 *
 * Tant que le délai court, l'investissement est en `EN_DELAI_RETRACTATION` :
 * les fractions sont réservées, les fonds bloqués sur le wallet, mais rien
 * n'est acquis. Ce service fait basculer l'engagement en définitif :
 *
 *   1. libère les fonds bloqués vers le projet (ESCROW_RELEASE + SOUSCRIPTION) ;
 *   2. génère l'échéancier investisseur ;
 *   3. bascule le projet en FINANCE si toutes les fractions sont acquises et
 *      qu'aucune souscription ne reste sous délai.
 *
 * Chaque investissement est traité dans sa propre transaction : un échec isolé
 * ne bloque pas les autres. La transition d'état est conditionnelle, donc
 * rejouer le cron est sans effet sur ce qui est déjà confirmé.
 */
@Injectable()
export class ConfirmRetractationCronService {
  private readonly logger = new Logger(ConfirmRetractationCronService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async confirmExpiredRetractationDelays(): Promise<void> {
    const now = new Date();

    const echus = await this.dataSource.getRepository(InvestmentEntity).find({
      where: {
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
        delaiRetractationJusquAu: LessThan(now),
      },
      select: ['id'],
    });

    if (echus.length === 0) {
      this.logger.debug('CRON confirm-retractation: aucun délai expiré');
      return;
    }

    let confirmes = 0;
    for (const { id } of echus) {
      try {
        if (await this.confirmerUnInvestissement(id)) confirmes += 1;
      } catch (err) {
        this.logger.error(
          `CRON confirm-retractation: échec sur l'investissement ${id} — ${(err as Error)?.message}`,
        );
      }
    }

    this.logger.log(
      `CRON confirm-retractation: ${confirmes}/${echus.length} souscription(s) confirmée(s)`,
    );
  }

  /** @returns vrai si cet appel a effectivement confirmé l'investissement. */
  private async confirmerUnInvestissement(investmentId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      // Transition conditionnelle : si un autre passage (ou une rétractation)
      // a déjà changé le statut, on n'a rien à faire et rien à libérer.
      const claim = await manager
        .createQueryBuilder()
        .update(InvestmentEntity)
        .set({ statut: InvestmentStatus.CONFIRME })
        .where('id = :id AND statut = :enAttente', {
          id: investmentId,
          enAttente: InvestmentStatus.EN_DELAI_RETRACTATION,
        })
        .execute();
      if (!claim.affected) return false;

      const inv = await manager.findOneOrFail(InvestmentEntity, {
        where: { id: investmentId },
      });
      const montant = Number(inv.montant);

      // 1. Verrou sur la ligne projet AVANT le wallet — même ordre de prise de
      //    verrous que CreateInvestmentUseCase (projet puis wallet), pour ne
      //    jamais croiser une souscription concurrente en étreinte fatale.
      const project = await manager.findOne(ProjectEntity, {
        where: { id: inv.projetId },
        lock: { mode: 'pessimistic_write' },
      });

      // 2. Libération des fonds bloqués. Le solde disponible a déjà été débité
      //    à la souscription : seul le solde bloqué se dénoue ici.
      //    GRAND LIVRE — l'engagement devient définitif : les fonds quittent
      //    réellement l'investisseur et sont acquis au projet. Le wallet
      //    technique du projet est crédité en contrepartie exacte du
      //    déblocage, sinon la libération d'escrow détruirait de l'argent.
      const wallet = await manager.findOne(WalletEntity, {
        where: {
          proprietaireUserId: inv.utilisateurId,
          type: WalletType.INVESTISSEUR,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (wallet) {
        wallet.soldeBloque = Math.max(0, Number(wallet.soldeBloque ?? 0) - montant);
        await manager.save(WalletEntity, wallet);

        const walletProjet =
          await this.projectWalletResolver.executeInTransaction(
            manager,
            inv.projetId,
            { verrouillerProjet: false, devise: wallet.devise },
          );
        walletProjet.solde = Number(walletProjet.solde) + montant;
        await manager.save(WalletEntity, walletProjet);

        await manager.save(
          TransactionEntity,
          manager.create(TransactionEntity, {
            walletSource: wallet.id,
            walletDestination: walletProjet.id,
            type: TransactionType.ESCROW_RELEASE,
            montant,
            devise: wallet.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: inv.id,
            projetId: inv.projetId,
            idempotencyKey: `retract-release:${inv.id}`,
            fraisPsp: 0,
            fraisPlateforme: 0,
            metadata: { kind: 'confirmation_delai_reflexion' },
          }),
        );
      }

      // 3. Échéancier investisseur — généré seulement maintenant que
      //    l'engagement est définitif.
      if (project) {
        const dejaGenere = await manager.count(EcheanceEntity, {
          where: { investissementId: inv.id },
        });
        if (dejaGenere === 0) {
          const echeances = this.genererEcheances(
            inv.id,
            montant,
            Number(project.triCible ?? 0),
            Number(project.dureeMois),
          );
          await manager.save(
            EcheanceEntity,
            echeances.map(InvestmentMapper.echeanceToEntity),
          );
        }

        // 4. Bascule en FINANCE si plus rien n'est en suspens.
        await this.basculerEnFinanceSiComplet(manager, project);
      }

      return true;
    });
  }

  private async basculerEnFinanceSiComplet(
    manager: EntityManager,
    project: ProjectEntity,
  ): Promise<void> {
    if (project.statut !== ProjectStatus.EN_COLLECTE) return;

    const prixFraction = Number(project.ticketMinimum);
    const nbFractionsTotal =
      project.nbFractions ??
      Math.floor(Number(project.capitalCible) / prixFraction);

    const raw = await manager
      .createQueryBuilder(InvestmentEntity, 'i')
      .select('COALESCE(SUM(i.nbTitres), 0)', 'total')
      .where('i.projetId = :projetId', { projetId: project.id })
      .andWhere('i.statut NOT IN (:...exclus)', {
        exclus: [InvestmentStatus.RETRACTE, InvestmentStatus.ANNULE],
      })
      .getRawOne<{ total: string }>();

    const vendues = Number(raw?.total ?? 0);
    if (vendues < nbFractionsTotal) return;

    const enAttente = await manager.count(InvestmentEntity, {
      where: {
        projetId: project.id,
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      },
    });
    if (enAttente > 0) return;

    project.statut = ProjectStatus.FINANCE;
    await manager.save(ProjectEntity, project);
    this.logger.log(`Projet ${project.id} basculé en FINANCE (délais de réflexion purgés)`);
  }

  /**
   * Échéancier in fine, aligné sur `CreateInvestmentUseCase.generateEcheances`.
   * Le mode de remboursement n'est pas persisté sur l'investissement : le mode
   * par défaut du produit s'applique.
   */
  private genererEcheances(
    investissementId: string,
    montant: number,
    triAnnuel: number,
    dureeMois: number,
    mode: RemboursementMode = RemboursementMode.IN_FINE,
  ): Echeance[] {
    const echeances: Echeance[] = [];
    const tauxMensuel = triAnnuel / 100 / 12;
    const now = new Date();

    if (mode === RemboursementMode.IN_FINE) {
      for (let i = 1; i <= dureeMois; i++) {
        const datePrevue = new Date(now);
        datePrevue.setMonth(datePrevue.getMonth() + i);
        const ech = new Echeance();
        ech.investissementId = investissementId;
        ech.numero = i;
        ech.datePrevue = datePrevue;
        ech.montantCapital = i === dureeMois ? montant : 0;
        ech.montantInterets = Math.round(montant * tauxMensuel * 100) / 100;
        ech.montantTotal = ech.montantCapital + ech.montantInterets;
        ech.statut = EcheanceStatus.A_VENIR;
        ech.payeLe = null;
        echeances.push(ech);
      }
      return echeances;
    }

    const capitalMensuel = montant / dureeMois;
    let solde = montant;
    for (let i = 1; i <= dureeMois; i++) {
      const datePrevue = new Date(now);
      datePrevue.setMonth(datePrevue.getMonth() + i);
      const interets = Math.round(solde * tauxMensuel * 100) / 100;
      const capital = Math.round(capitalMensuel * 100) / 100;
      const ech = new Echeance();
      ech.investissementId = investissementId;
      ech.numero = i;
      ech.datePrevue = datePrevue;
      ech.montantCapital = capital;
      ech.montantInterets = interets;
      ech.montantTotal = capital + interets;
      ech.statut = EcheanceStatus.A_VENIR;
      ech.payeLe = null;
      echeances.push(ech);
      solde -= capital;
    }
    return echeances;
  }
}
