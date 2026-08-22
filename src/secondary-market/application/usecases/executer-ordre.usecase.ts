import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrdreMarcheEntity } from 'src/secondary-market/infrastructure/persistence/entities/ordre-marche.entity';
import { OrdreMarcheOrmMapper } from 'src/secondary-market/infrastructure/persistence/mappers/ordre-marche.orm-mapper';
import type { ExecutionDeCession } from 'src/secondary-market/domain/aggregates/secondary-market-order';
import {
  InvestissementSourceIntrouvableError,
  OrdreIntrouvableError,
  SoldeInsuffisantError,
  WalletAcheteurIntrouvableError,
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
import { NotificationEventService } from 'src/notifications/applications/notification-event.service';

/** Ce que la route rend au front — contrat inchangé. */
export interface ResultatExecution {
  success: true;
  investissementId: string;
  fractionsAchetees: number;
  restantDansOrdre: number;
  fusionnee: boolean;
}

/**
 * **Exécuter un ordre** — un investisseur reprend tout ou partie des fractions
 * offertes au carnet : il est débité, le vendeur crédité, et les titres
 * changent de porteur.
 *
 * Le use case orchestre, il ne décide pas (§14). La disponibilité de l'ordre,
 * l'interdiction d'acheter le sien, les bornes de quantité et le montant à
 * régler appartiennent à `SecondaryMarketOrder.executer` — ils vivaient dans
 * `SecondaryMarketController`, en quatre `if` répartis de part et d'autre de
 * l'ouverture de transaction.
 *
 * L'atomicité est inchangée, et c'est le point délicat de ce contexte :
 *
 *  1. l'ordre est relu SOUS VERROU dans la transaction, et le domaine rejoue
 *     sa décision sur cette lecture-là — deux achats concurrents sur le même
 *     ordre sont ainsi sérialisés, impossible de survendre ;
 *  2. l'acheteur est débité par un UPDATE CONDITIONNEL (`WHERE solde >= :cost`,
 *     `affected === 1`) AVANT tout transfert de titres ;
 *  3. crédit vendeur, traces ledger, fusion ou création de la position
 *     acheteuse et décrément de la position vendeuse sont dans la même
 *     transaction.
 *
 * Une panne partielle annule TOUT : ni titres transférés, ni acheteur débité.
 *
 * > ⚠️ Le décrément de la position vendeuse retranche le **prix de vente** du
 * > montant investi, et non le coût d'acquisition — la limite que
 * > `computeCoutAcquisition` documente déjà. Comportement inchangé ici : le
 * > corriger demande un historique d'acquisition par lot, qui n'est pas
 * > modélisé.
 */
@Injectable()
export class ExecuterOrdreUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrdreMarcheEntity)
    private readonly ordreRepo: Repository<OrdreMarcheEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly notificationEvents: NotificationEventService,
  ) {}

  async execute(
    ordreId: string,
    acheteurId: number,
    nbFractionsDemandees?: number,
  ): Promise<ResultatExecution> {
    const ligne = await this.ordreRepo.findOne({
      where: { id: ordreId },
      relations: ['investissement', 'investissement.projet'],
    });
    if (!ligne) throw new OrdreIntrouvableError(ordreId);

    const investOriginal = ligne.investissement;
    if (!investOriginal) throw new InvestissementSourceIntrouvableError();

    // Pré-vérification hors transaction : elle épargne un verrou à une demande
    // manifestement invalide. C'est la passe SOUS VERROU qui fait foi.
    const apercu = OrdreMarcheOrmMapper.toDomain(ligne);
    const nbFractions = nbFractionsDemandees ?? apercu.nbFractions;
    apercu.assertAchetablePar(nbFractions, acheteurId);

    const vendeurId = apercu.vendeurId;

    const resultat = await this.dataSource.transaction(async (em) => {
      // ── 1. L'ordre, relu sous verrou : la décision se rejoue dessus ────────
      const verrouillee = await em.findOne(OrdreMarcheEntity, {
        where: { id: ordreId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!verrouillee) throw new OrdreIntrouvableError(ordreId);

      const ordre = OrdreMarcheOrmMapper.toDomain(verrouillee);
      const cession: ExecutionDeCession = ordre.executer(
        nbFractions,
        acheteurId,
      );

      // ── 2. Règlement financier ATOMIQUE, avant tout transfert de titres ────
      const walletAcheteur = await em.findOne(WalletEntity, {
        where: {
          proprietaireUserId: acheteurId,
          type: WalletType.INVESTISSEUR,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!walletAcheteur) throw new WalletAcheteurIntrouvableError();
      if (Number(walletAcheteur.solde) < cession.montantRegle) {
        throw new SoldeInsuffisantError();
      }

      const debit = await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde - :cost' })
        .setParameter('cost', cession.montantRegle)
        .where('id = :id AND solde >= :cost', {
          id: walletAcheteur.id,
          cost: cession.montantRegle,
        })
        .execute();
      if (!debit.affected) throw new SoldeInsuffisantError();

      const walletVendeur = await this.walletDuVendeur(
        em,
        vendeurId,
        walletAcheteur.devise,
      );
      await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({ solde: () => 'solde + :cost' })
        .setParameter('cost', cession.montantRegle)
        .where('id = :id', { id: walletVendeur.id })
        .execute();

      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          walletSource: walletAcheteur.id,
          type: TransactionType.SOUSCRIPTION,
          montant: cession.montantRegle,
          devise: walletAcheteur.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          projetId: investOriginal.projetId,
          metadata: {
            kind: 'achat_marche_secondaire',
            ordreId,
            vendeurId,
            nbFractions: cession.fractionsCedees,
          },
        }),
      );
      await em.save(
        TransactionEntity,
        em.create(TransactionEntity, {
          walletDestination: walletVendeur.id,
          type: TransactionType.INTERNE,
          montant: cession.montantRegle,
          devise: walletVendeur.devise,
          statut: TransactionStatus.REUSSI,
          fournisseur: TransactionFournisseur.INTERNE,
          projetId: investOriginal.projetId,
          metadata: {
            kind: 'vente_marche_secondaire',
            ordreId,
            acheteurId,
            nbFractions: cession.fractionsCedees,
          },
        }),
      );

      // ── 3. Transfert des titres : position acheteuse, puis vendeuse ────────
      const positionAcheteur = await em.findOne(InvestmentEntity, {
        where: {
          utilisateurId: acheteurId,
          projetId: investOriginal.projetId,
          statut: InvestmentStatus.CONFIRME,
        },
      });

      let investissementId: string;
      if (positionAcheteur) {
        positionAcheteur.nbTitres =
          (positionAcheteur.nbTitres ?? 0) + cession.fractionsCedees;
        positionAcheteur.montant =
          Number(positionAcheteur.montant) + cession.montantRegle;
        await em.save(InvestmentEntity, positionAcheteur);
        investissementId = positionAcheteur.id;
      } else {
        const nouvelle = em.create(InvestmentEntity, {
          projetId: investOriginal.projetId,
          utilisateurId: acheteurId,
          montant: cession.montantRegle,
          instrument: investOriginal.instrument,
          nbTitres: cession.fractionsCedees,
          valeurTitre: ordre.prixUnitaire,
          statut: InvestmentStatus.CONFIRME,
        });
        await em.save(InvestmentEntity, nouvelle);
        investissementId = nouvelle.id;
      }

      const positionVendeur = await em.findOne(InvestmentEntity, {
        where: { id: ordre.investissementId },
      });
      if (positionVendeur && positionVendeur.nbTitres != null) {
        const restant =
          Number(positionVendeur.nbTitres) - cession.fractionsCedees;
        positionVendeur.nbTitres = Math.max(0, restant);
        positionVendeur.montant =
          restant > 0
            ? Number(positionVendeur.montant) -
              cession.fractionsCedees *
                Number(positionVendeur.valeurTitre ?? ordre.prixUnitaire)
            : 0;
        await em.save(InvestmentEntity, positionVendeur);
      }

      // ── 4. L'ordre, dans l'état où la transition l'a laissé ────────────────
      await em.save(
        OrdreMarcheEntity,
        OrdreMarcheOrmMapper.appliquerSur(verrouillee, ordre),
      );

      return {
        success: true as const,
        investissementId,
        fractionsAchetees: cession.fractionsCedees,
        restantDansOrdre: cession.fractionsRestantes,
        fusionnee: !!positionAcheteur,
      };
    });

    // ── Effet de bord APRÈS commit (non bloquant pour la cession) ────────────
    const [projet, acheteur, vendeur] = await Promise.all([
      this.projectRepo.findOne({ where: { id: investOriginal.projetId } }),
      this.userRepo.findOne({ where: { userId: acheteurId } }),
      this.userRepo.findOne({ where: { userId: vendeurId } }),
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

    return resultat;
  }

  /** Le wallet investisseur du vendeur, créé à la première cession. */
  private async walletDuVendeur(
    em: EntityManager,
    vendeurId: number,
    devise: string,
  ): Promise<WalletEntity> {
    const existant = await em.findOne(WalletEntity, {
      where: { proprietaireUserId: vendeurId, type: WalletType.INVESTISSEUR },
    });
    if (existant) return existant;

    return em.save(
      em.create(WalletEntity, {
        type: WalletType.INVESTISSEUR,
        proprietaireUserId: vendeurId,
        fournisseurRef: `INV-${vendeurId}-auto`,
        devise,
        solde: 0,
      }),
    );
  }
}
