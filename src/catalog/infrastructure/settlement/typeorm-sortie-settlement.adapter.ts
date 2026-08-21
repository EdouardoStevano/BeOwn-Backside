import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  OrdreReglementSortie,
  ResultatReglementSortie,
  SortieSettlementPort,
  VersementSortie,
} from 'src/catalog/application/ports/sortie-settlement.port';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/wallets/domains/enums/wallet.enum';
import { TransactionEntity } from 'src/wallets/infrastructure/persistences/entities/transaction.entity';
import { WalletEntity } from 'src/wallets/infrastructure/persistences/entities/wallet.entity';

const DEVISE_PAR_DEFAUT = 'EUR';

/**
 * Exécute les mouvements d'argent d'une sortie, dans une seule transaction.
 *
 * Ces deux cent cinquante lignes vivaient dans `ExecuteSortieUseCase` — donc
 * dans la couche applicative, avec une `DataSource` et deux repositories
 * TypeORM injectés (§12.3) et la connaissance des tables du contexte Wallets.
 * Elles sont ici, derrière `SORTIE_SETTLEMENT_PORT` : c'est le rôle d'un
 * adapter de sortie, et le seul endroit du contexte Catalog qui ait le droit
 * de connaître `WalletEntity` et `TransactionEntity`.
 *
 * Les **clés d'idempotence sont inchangées** — `sortie:capital:{sortieId}:{invId}`,
 * `sortie:pv:…`, `sortie:ir:…`, `sortie:csg:…`,
 * `sortie:performance-fee:{sortieId}` : c'est ce qui protège d'un double
 * versement en cas de rejeu, et les modifier reviendrait à rendre rejouables
 * toutes les sorties déjà exécutées.
 *
 * Un investisseur sans wallet est ignoré, comme avant — et signalé au journal.
 * Le compte rendu ne retient que les versements réellement passés.
 */
@Injectable()
export class TypeOrmSortieSettlementAdapter implements SortieSettlementPort {
  private readonly logger = new Logger(TypeOrmSortieSettlementAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async regler(ordre: OrdreReglementSortie): Promise<ResultatReglementSortie> {
    const versementsEffectues: VersementSortie[] = [];

    await this.dataSource.transaction(async (em) => {
      if (ordre.fraisPerformance > 0) {
        await this.preleverFraisDePerformance(em, ordre);
      }

      // Ouverts à la demande, et une seule fois : la plupart des sorties n'ont
      // aucune fiscalité à séquestrer (moins-value), et la devise du séquestre
      // est celle du premier wallet investisseur rencontré.
      let walletIR: WalletEntity | null = null;
      let walletCSG: WalletEntity | null = null;

      for (const versement of ordre.versements) {
        const wallet = await em.findOne(WalletEntity, {
          where: {
            proprietaireUserId: versement.utilisateurId,
            type: WalletType.INVESTISSEUR,
          },
        });
        if (!wallet) {
          this.logger.warn(
            `Wallet investisseur user=${versement.utilisateurId} introuvable — ignoré.`,
          );
          continue;
        }

        // Peut être inférieur au capital remboursé en cas de moins-value :
        // l'investisseur prend la perte sur son capital.
        wallet.solde = Number(wallet.solde) + versement.netVerse;
        await em.save(WalletEntity, wallet);

        if (versement.impotRevenu > 0) {
          walletIR ??= await this.ouvrirSequestre(
            em,
            WalletType.SEQUESTRE_IR,
            'SEQUESTRE-IR',
            wallet.devise,
          );
          walletIR.solde = Number(walletIR.solde) + versement.impotRevenu;
          await em.save(WalletEntity, walletIR);
        }
        if (versement.prelevementsSociaux > 0) {
          walletCSG ??= await this.ouvrirSequestre(
            em,
            WalletType.SEQUESTRE_CSG,
            'SEQUESTRE-CSG',
            wallet.devise,
          );
          walletCSG.solde =
            Number(walletCSG.solde) + versement.prelevementsSociaux;
          await em.save(WalletEntity, walletCSG);
        }

        await this.ecrireLedger(em, {
          ordre,
          versement,
          walletDestination: wallet.id,
          devise: wallet.devise,
          walletIR,
          walletCSG,
        });

        versementsEffectues.push(versement);
      }
    });

    return { versementsEffectues };
  }

  /**
   * Crédite le wallet de frais de la plateforme au titre du gain à la vente du
   * bien. Le wallet est ouvert s'il n'existe pas encore.
   */
  private async preleverFraisDePerformance(
    em: EntityManager,
    ordre: OrdreReglementSortie,
  ): Promise<void> {
    let walletPlateforme = await em.findOne(WalletEntity, {
      where: { type: WalletType.FRAIS_PLATEFORME },
    });
    if (!walletPlateforme) {
      walletPlateforme = await em.save(
        WalletEntity,
        em.create(WalletEntity, {
          type: WalletType.FRAIS_PLATEFORME,
          proprietaireUserId: null,
          fournisseurRef: 'PLAT-FEES-001',
          devise: DEVISE_PAR_DEFAUT,
          solde: 0,
        }),
      );
    }
    walletPlateforme.solde =
      Number(walletPlateforme.solde) + ordre.fraisPerformance;
    await em.save(WalletEntity, walletPlateforme);

    await em.save(
      TransactionEntity,
      em.create(TransactionEntity, {
        walletDestination: walletPlateforme.id,
        type: TransactionType.SOUSCRIPTION,
        montant: ordre.fraisPerformance,
        devise: walletPlateforme.devise,
        statut: TransactionStatus.REUSSI,
        fournisseur: TransactionFournisseur.INTERNE,
        projetId: ordre.projetId,
        idempotencyKey: `sortie:performance-fee:${ordre.sortieId}`,
        fraisPsp: 0,
        fraisPlateforme: 0,
        metadata: {
          source: 'gain_vente_bien',
          sortieId: ordre.sortieId,
          plusValueBrute: ordre.plusValueBrute,
        },
      }),
    );
  }

  private async ouvrirSequestre(
    em: EntityManager,
    type: WalletType,
    fournisseurRef: string,
    devise: string,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, { where: { type } });
    if (existant) return existant;
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

  /** Une écriture par nature de flux — c'est ce qui rend le ledger auditable. */
  private async ecrireLedger(
    em: EntityManager,
    ctx: {
      ordre: OrdreReglementSortie;
      versement: VersementSortie;
      walletDestination: string;
      devise: string;
      walletIR: WalletEntity | null;
      walletCSG: WalletEntity | null;
    },
  ): Promise<void> {
    const { ordre, versement, devise } = ctx;
    const commun = {
      devise,
      statut: TransactionStatus.REUSSI,
      fournisseur: TransactionFournisseur.INTERNE,
      investissementId: versement.investissementId,
      projetId: ordre.projetId,
      fraisPsp: 0,
      fraisPlateforme: 0,
    };

    await em.save(
      TransactionEntity,
      em.create(TransactionEntity, {
        ...commun,
        walletDestination: ctx.walletDestination,
        type: TransactionType.REMBOURSEMENT_CAPITAL,
        montant: versement.capitalRembourse,
        idempotencyKey: `sortie:capital:${ordre.sortieId}:${versement.investissementId}`,
      }),
    );

    // Peut être négative — une moins-value s'inscrit au ledger comme le reste.
    if (versement.plusValuePart !== 0) {
      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          ...commun,
          walletDestination: ctx.walletDestination,
          type: TransactionType.PAIEMENT_INTERETS,
          montant: versement.plusValuePart,
          idempotencyKey: `sortie:pv:${ordre.sortieId}:${versement.investissementId}`,
        }),
      );
    }

    if (versement.impotRevenu > 0 && ctx.walletIR) {
      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          ...commun,
          walletDestination: ctx.walletIR.id,
          type: TransactionType.IMPOTS,
          montant: versement.impotRevenu,
          idempotencyKey: `sortie:ir:${ordre.sortieId}:${versement.investissementId}`,
        }),
      );
    }

    if (versement.prelevementsSociaux > 0 && ctx.walletCSG) {
      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          ...commun,
          walletDestination: ctx.walletCSG.id,
          type: TransactionType.IMPOTS,
          montant: versement.prelevementsSociaux,
          idempotencyKey: `sortie:csg:${ordre.sortieId}:${versement.investissementId}`,
        }),
      );
    }
  }
}
