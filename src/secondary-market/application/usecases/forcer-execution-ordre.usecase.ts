import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { OrdreMarcheOrmMapper } from 'src/secondary-market/infrastructure/persistence/mappers/ordre-marche.orm-mapper';
import { computeCoutAcquisition } from 'src/secondary-market/domain/services/cout-acquisition';
import {
  OrdreIntrouvableError,
  SoldeAcheteurInsuffisantError,
} from 'src/secondary-market/domain/errors';
import { InvestmentEntity } from 'src/subscription/infrastructure/persistence/entities/investment.entity';
import { InvestmentStatus } from 'src/subscription/domain/enums/investment-status.enum';
import { ProjectEntity } from 'src/catalog/infrastructure/persistence/entities/project.entity';
import { UserEntity } from 'src/iam/infrastructure/persistence/entities/user.entity';
import { WalletEntity } from 'src/treasury/infrastructure/persistence/entities/wallet.entity';
import { TransactionEntity } from 'src/treasury/infrastructure/persistence/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from 'src/treasury/domain/enums/wallet.enum';
import { PlatformFeesService } from 'src/common/platform-fees/platform-fees.service';
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/**
 * **Forcer l'exécution d'un appariement** resté en suspens : l'administration
 * conclut une cession que le parcours de signature n'a pas menée à son terme.
 *
 * Le use case orchestre, il ne décide pas (§14) : que seul un `MATCH_PROPOSE`
 * doté d'un acheteur se force appartient à
 * `SecondaryMarketOrder.forcerExecution()`.
 *
 * Le règlement est celui d'une cession ordinaire, à une différence près qui
 * justifie l'existence de cette route : **il n'y a pas de signature**. Les
 * traces de frais portent donc une clé d'idempotence suffixée `:admin` et
 * aucune `metadata.signatureId` — ce qui les range, à l'annulation, dans leur
 * propre groupe de remplissage (voir `AnnulerOrdreParAdministrationUseCase`).
 *
 * > ⚠️ Les taux de frais sont lus **une seule fois** avant la transaction : un
 * > administrateur qui modifierait les commissions pendant le traitement ne
 * > ferait pas dériver le calcul en cours.
 */
@Injectable()
export class ForcerExecutionOrdreUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordres: Repository<OrdreMarcheEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projets: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly comptes: Repository<UserEntity>,
    private readonly platformFees: PlatformFeesService,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(
    ordreId: string,
  ): Promise<{ success: true; buyerInvestId: string }> {
    const ligne = await this.ordres.findOne({
      where: { id: ordreId },
      relations: ['investissement'],
    });
    if (!ligne) throw new OrdreIntrouvableError(ordreId);

    const ordre = OrdreMarcheOrmMapper.toDomain(ligne);
    ordre.forcerExecution();

    const nbFractions = ordre.nbFractions;
    const prixUnitaire = ordre.prixUnitaire;
    const montantTotal = ordre.montant;
    const acheteurId = ordre.acheteurId!;
    const vendeurId = ordre.vendeurId;
    const projetId = ligne.investissement.projetId;

    // Plus-value vendeur = prix de vente − coût d'acquisition (coût moyen
    // pondéré), calculée AVANT réduction de la position vendeuse.
    const coutAcquisition = computeCoutAcquisition(
      ligne.investissement,
      nbFractions,
      prixUnitaire,
    );
    const plusValueVendeur = round2(montantTotal - coutAcquisition);
    const feeRates = await this.platformFees.getRates();
    const { transactionFee, gainFee } =
      await this.platformFees.computeResaleFees(
        montantTotal,
        plusValueVendeur,
        feeRates,
      );
    const totalFrais = round2(transactionFee + gainFee);
    const montantNetVendeur = round2(montantTotal - totalFrais);

    const { buyerInvestId } = await this.dataSource.transaction(async (em) => {
      const walletAcheteur = await em.findOne(WalletEntity, {
        where: {
          proprietaireUserId: acheteurId,
          type: WalletType.INVESTISSEUR,
        },
      });
      if (!walletAcheteur || Number(walletAcheteur.solde) < montantTotal) {
        throw new SoldeAcheteurInsuffisantError();
      }
      const walletVendeur = await em.findOne(WalletEntity, {
        where: { proprietaireUserId: vendeurId, type: WalletType.INVESTISSEUR },
      });

      // Position acheteuse : fusion, ou création.
      const positionExistante = await em.findOne(InvestmentEntity, {
        where: {
          utilisateurId: acheteurId,
          projetId,
          statut: InvestmentStatus.CONFIRME,
        },
      });

      let positionAcheteur: InvestmentEntity;
      if (positionExistante) {
        positionExistante.nbTitres =
          (Number(positionExistante.nbTitres) ?? 0) + nbFractions;
        positionExistante.montant =
          Number(positionExistante.montant) + montantTotal;
        positionAcheteur = await em.save(InvestmentEntity, positionExistante);
      } else {
        positionAcheteur = await em.save(
          InvestmentEntity,
          em.create(InvestmentEntity, {
            projetId,
            utilisateurId: acheteurId,
            montant: montantTotal,
            instrument: ligne.investissement.instrument,
            nbTitres: nbFractions,
            valeurTitre: prixUnitaire,
            statut: InvestmentStatus.CONFIRME,
          }),
        );
      }

      // Position vendeuse : décrément.
      const positionVendeur = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (positionVendeur && positionVendeur.nbTitres != null) {
        const restant = Number(positionVendeur.nbTitres) - nbFractions;
        positionVendeur.nbTitres = Math.max(0, restant);
        positionVendeur.montant =
          restant > 0 ? Number(positionVendeur.montant) - montantTotal : 0;
        await em.save(InvestmentEntity, positionVendeur);
      }

      await em.save(
        OrdreMarcheEntity,
        OrdreMarcheOrmMapper.appliquerSur(ligne, ordre),
      );

      // Mouvements de fonds.
      walletAcheteur.solde = Number(walletAcheteur.solde) - montantTotal;
      await em.save(WalletEntity, walletAcheteur);
      if (walletVendeur) {
        walletVendeur.solde = Number(walletVendeur.solde) + montantNetVendeur;
        await em.save(WalletEntity, walletVendeur);
      }

      let walletPlateforme: WalletEntity | null = null;
      if (totalFrais > 0) {
        walletPlateforme = await em.findOne(WalletEntity, {
          where: { type: WalletType.FRAIS_PLATEFORME },
        });
        if (!walletPlateforme) {
          walletPlateforme = await em.save(
            WalletEntity,
            em.create(WalletEntity, {
              type: WalletType.FRAIS_PLATEFORME,
              proprietaireUserId: null,
              fournisseurRef: 'PLAT-FEES-001',
              devise: walletAcheteur.devise,
              solde: 0,
            }),
          );
        }
        walletPlateforme.solde = Number(walletPlateforme.solde) + totalFrais;
        await em.save(WalletEntity, walletPlateforme);
      }

      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          walletSource: walletAcheteur.id,
          walletDestination: walletVendeur?.id ?? null,
          type: TransactionType.SOUSCRIPTION,
          montant: montantTotal,
          devise: walletAcheteur.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          investissementId: positionAcheteur.id,
          projetId,
          idempotencyKey: `admin-force:buyer:${ordreId}`,
          fraisPsp: 0,
          fraisPlateforme: totalFrais,
        }),
      );

      // Une trace PAR frais, retrouvable à l'annulation par metadata.ordreId.
      if (walletPlateforme && transactionFee > 0) {
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: null,
            walletDestination: walletPlateforme.id,
            type: TransactionType.SOUSCRIPTION,
            montant: transactionFee,
            devise: walletPlateforme.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: ordre.investissementId,
            projetId,
            idempotencyKey: `secmarket:fee:revente_transaction:order:${ordreId}:admin`,
            fraisPsp: 0,
            fraisPlateforme: 0,
            metadata: { source: 'revente_transaction', ordreId },
          }),
        );
      }
      if (walletPlateforme && gainFee > 0) {
        await em.save(
          TransactionEntity,
          em.create(TransactionEntity, {
            walletSource: null,
            walletDestination: walletPlateforme.id,
            type: TransactionType.SOUSCRIPTION,
            montant: gainFee,
            devise: walletPlateforme.devise,
            statut: TransactionStatus.REUSSI,
            fournisseur: TransactionFournisseur.INTERNE,
            investissementId: ordre.investissementId,
            projetId,
            idempotencyKey: `secmarket:fee:gain_revente_actions:order:${ordreId}:admin`,
            fraisPsp: 0,
            fraisPlateforme: 0,
            metadata: {
              source: 'gain_revente_actions',
              ordreId,
              plusValueVendeur,
              coutAcquisition,
            },
          }),
        );
      }

      return { buyerInvestId: positionAcheteur.id };
    });

    // ── Effet de bord APRÈS commit (non bloquant pour la cession) ────────────
    const [projet, acheteur, vendeur] = await Promise.all([
      this.projets.findOne({ where: { id: projetId } }),
      this.comptes.findOne({ where: { userId: acheteurId } }),
      this.comptes.findOne({ where: { userId: vendeurId } }),
    ]);
    if (projet && acheteur && vendeur) {
      await this.notificationEvents.secondaryTradeExecuted(
        ligne,
        projet,
        acheteur,
        vendeur,
        nbFractions,
      );
    }

    return { success: true, buyerInvestId };
  }
}

const round2 = (montant: number): number => Math.round(montant * 100) / 100;
