import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ProjectEntity } from 'src/projects/infrastructure/persistences/entities/project.entity';
import { InvestmentEntity } from 'src/investments/infrastructure/persistences/entities/investment.entity';
import { InvestmentStatus } from 'src/investments/domains/enums/investment-status.enum';
import { WalletEntity } from '../infrastructure/persistences/entities/wallet.entity';
import { TransactionEntity } from '../infrastructure/persistences/entities/transaction.entity';
import {
  TransactionFournisseur,
  TransactionStatus,
  TransactionType,
  WalletType,
} from '../domains/enums/wallet.enum';
import {
  EtatFinancierProjet,
  calculerEtatFinancierProjet,
  etatFinancierSansMouvement,
} from '../domains/etat-financier-projet';
import { TOLERANCE_INVARIANT_EUR } from '../domains/grand-livre';
import { ResolveProjectWalletUseCase } from './usecases/resolve-project-wallet.usecase';
import {
  PlatformFeeRates,
  PlatformFeesService,
} from 'src/common/platform-fees/platform-fees.service';
import { formatEur } from 'src/shared/money/format-eur';

/** Marqueur `metadata.kind` des versements au porteur constatés hors plateforme. */
export const KIND_VERSEMENT_PORTEUR = 'versement_porteur';

export interface DeclarerVersementInput {
  projetId: string;
  /** Référence du virement bancaire effectué hors plateforme. Clé d'idempotence. */
  referenceBancaire: string;
  /** Date à laquelle le virement a été effectué. */
  dateVersement: Date;
  /** Montant versé ; à défaut, tout le restant dû. */
  montant?: number;
  commentaire?: string | null;
  declareParUserId: number;
}

export interface VersementDeclare {
  transactionId: string;
  projetId: string;
  montant: number;
  referenceBancaire: string;
  dateVersement: Date;
  etatFinancier: EtatFinancierProjet;
}

/**
 * Lecture et mutation du grand livre d'un projet.
 *
 * PÉRIMÈTRE VOLONTAIREMENT INTERNE — ce service ne parle à aucun prestataire
 * de paiement. La déclaration de versement enregistre qu'un virement a été
 * fait HORS plateforme ; elle n'en exécute aucun. Voir
 * docs/adr/ADR-grand-livre-interne.md.
 */
@Injectable()
export class ProjectLedgerService {
  private readonly logger = new Logger(ProjectLedgerService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly projectWalletResolver: ResolveProjectWalletUseCase,
    private readonly platformFees: PlatformFeesService,
  ) {}

  /**
   * Frais de plateforme dus au titre de la collecte elle-même, selon la
   * grille configurée (jamais un taux en dur).
   *
   * La grille actuelle (PlatformFeeRates) n'assoit AUCUN frais sur la
   * collecte : les frais d'entrée à la souscription ont été supprimés et les
   * commissions se prélèvent à l'exécution des distributions (annuel + gestion
   * locative), aux sorties et au marché secondaire. Le net à verser à la
   * clôture est donc le collecté moins les frais déjà inscrits au grand livre.
   * Si un taux assis sur la collecte apparaît un jour dans la grille, il
   * s'applique ICI — pas dans les crons ni les contrôleurs (OCP).
   */
  fraisDusSurCollecte(_collecte: number, _rates: PlatformFeeRates): number {
    return 0;
  }

  /** État financier d'un projet, dérivé exclusivement du grand livre. */
  async etatFinancier(projetId: string): Promise<EtatFinancierProjet> {
    const manager = this.dataSource.manager;

    const project = await manager.findOne(ProjectEntity, {
      where: { id: projetId },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const wallet = await this.projectWalletResolver.findInTransaction(
      manager,
      projetId,
    );
    if (!wallet) {
      // Aucun mouvement n'a jamais atteint ce projet — mais il peut déjà
      // porter des engagements en délai de rétractation (ANO-03) : ces
      // montants ne dépendent d'aucun wallet et doivent remonter.
      return etatFinancierSansMouvement(projetId, {
        enDelaiReflexion: await this.sommeEngagementsEnDelai(manager, projetId),
      });
    }

    return this.etatFinancierDansTransaction(manager, projetId, wallet);
  }

  /**
   * Constate un versement au porteur effectué hors plateforme.
   *
   * PUREMENT DÉCLARATIF : aucun PSP n'est appelé, aucun virement n'est émis.
   * Idempotent sur la référence bancaire : la même référence ne peut être
   * enregistrée qu'une fois par projet (clé d'idempotence + contrainte unique
   * en base) — un doublon est rejeté en 409.
   */
  async declarerVersementPorteur(
    input: DeclarerVersementInput,
  ): Promise<VersementDeclare> {
    const reference = input.referenceBancaire?.trim();
    if (!reference) {
      throw new BadRequestException('La référence bancaire est obligatoire.');
    }
    if (
      !(input.dateVersement instanceof Date) ||
      Number.isNaN(input.dateVersement.getTime())
    ) {
      throw new BadRequestException('La date de versement est invalide.');
    }

    const idempotencyKey = `versement-porteur:${input.projetId}:${reference}`;

    return this.dataSource.transaction(async (manager) => {
      // Verrou sur la ligne projet : sérialise deux déclarations concurrentes
      // (même point de rendez-vous que toutes les écritures financières).
      const project = await manager.findOne(ProjectEntity, {
        where: { id: input.projetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!project) throw new NotFoundException('Projet introuvable.');

      const doublon = await manager.findOne(TransactionEntity, {
        where: { idempotencyKey },
      });
      if (doublon) {
        throw new ConflictException(
          `Un versement portant la référence « ${reference} » est déjà enregistré pour ce projet.`,
        );
      }

      const wallet = await this.projectWalletResolver.executeInTransaction(
        manager,
        input.projetId,
        { verrouillerProjet: false },
      );

      const solde = Number(wallet.solde);
      const montant =
        input.montant !== undefined ? Number(input.montant) : solde;
      if (!Number.isFinite(montant) || montant <= 0) {
        throw new BadRequestException(
          'Le montant du versement doit être strictement positif.',
        );
      }
      if (montant > solde + TOLERANCE_INVARIANT_EUR) {
        throw new BadRequestException(
          `Le montant déclaré (${formatEur(montant)}) dépasse le solde du wallet projet (${formatEur(solde)}).`,
        );
      }

      // Sortie de fonds à contrepartie EXTERNE : le grand livre interne est
      // débité, la destination est le compte bancaire du porteur, hors
      // plateforme — c'est le seul mouvement légitime sans wallet destination.
      wallet.solde = solde - montant;
      await manager.save(WalletEntity, wallet);

      const tx = await manager.save(
        TransactionEntity,
        manager.create(TransactionEntity, {
          walletSource: wallet.id,
          walletDestination: null,
          montant,
          devise: wallet.devise ?? 'EUR',
          type: TransactionType.RETRAIT,
          fournisseur: TransactionFournisseur.MANUEL,
          statut: TransactionStatus.REUSSI,
          projetId: input.projetId,
          referenceExterne: reference,
          idempotencyKey,
          fraisPsp: 0,
          fraisPlateforme: 0,
          metadata: {
            kind: KIND_VERSEMENT_PORTEUR,
            dateVersement: input.dateVersement.toISOString(),
            commentaire: input.commentaire ?? null,
            declarePar: input.declareParUserId,
          },
        }),
      );

      this.logger.log(
        `Versement porteur constaté sur le projet ${input.projetId} : ${formatEur(montant)} (réf. ${reference}).`,
      );

      return {
        transactionId: tx.id,
        projetId: input.projetId,
        montant,
        referenceBancaire: reference,
        dateVersement: input.dateVersement,
        etatFinancier: await this.etatFinancierDansTransaction(
          manager,
          input.projetId,
          wallet,
        ),
      };
    });
  }

  /**
   * États financiers d'une PAGE de projets, en un nombre CONSTANT de requêtes.
   *
   * Le tableau du back-office affiche une ligne par projet : appeler
   * `etatFinancier` en boucle produirait un N+1 (cinq agrégats par projet).
   * Trois requêtes suffisent, quel que soit le nombre de projets de la page —
   * la règle de calcul reste la fonction pure du domaine, seule source de
   * vérité partagée avec la lecture unitaire.
   */
  async etatFinancierParProjets(
    projetIds: string[],
  ): Promise<Map<string, EtatFinancierProjet>> {
    const resultats = new Map<string, EtatFinancierProjet>();
    if (projetIds.length === 0) return resultats;

    const manager = this.dataSource.manager;

    // 1. Engagements encore sous délai de réflexion, groupés par projet.
    //    Calculé EN PREMIER et appliqué à TOUS les projets de la page, avant
    //    toute considération de wallet : ces montants se lisent sur les
    //    investissements, pas sur le grand livre (ANO-03). Un projet en
    //    collecte n'a pas encore de wallet technique — c'est précisément le cas
    //    où le back-office affichait zéro sur des engagements bien réels.
    const enDelaiParProjet = await this.sommeEngagementsEnDelaiParProjets(
      manager,
      projetIds,
    );
    for (const projetId of projetIds) {
      resultats.set(
        projetId,
        etatFinancierSansMouvement(projetId, {
          enDelaiReflexion: enDelaiParProjet.get(projetId) ?? 0,
        }),
      );
    }

    // 2. Wallets techniques des projets demandés.
    const wallets = await manager
      .createQueryBuilder(WalletEntity, 'w')
      .where('w.type = :type', { type: WalletType.TECHNIQUE_PROJET })
      .andWhere('w.projetId IN (:...ids)', { ids: projetIds })
      .getMany();
    if (wallets.length === 0) return resultats;

    const walletIds = wallets.map((w) => w.id);

    // 3. Agrégats du grand livre, groupés par wallet (mouvements intra-wallet
    //    exclus : ils ne font ni entrer ni sortir d'argent).
    const agregats = await manager
      .createQueryBuilder(TransactionEntity, 't')
      .select('w.id', 'walletId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.walletDestination = w.id THEN t.montant ELSE 0 END), 0)`,
        'credite',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.walletSource = w.id THEN t.montant ELSE 0 END), 0)`,
        'totalDebits',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.walletSource = w.id AND t.type = :remb THEN t.montant ELSE 0 END), 0)`,
        'rembourse',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.walletSource = w.id AND t.type = :frais THEN t.montant ELSE 0 END), 0)`,
        'frais',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.walletSource = w.id AND t.type = :retrait THEN t.montant ELSE 0 END), 0)`,
        'verse',
      )
      .innerJoin(
        WalletEntity,
        'w',
        '(t.walletDestination = w.id OR t.walletSource = w.id)',
      )
      .where('w.id IN (:...walletIds)', { walletIds })
      .andWhere('t.statut = :statut', { statut: TransactionStatus.REUSSI })
      .andWhere(
        '(t.walletSource IS NULL OR t.walletDestination IS NULL OR t.walletSource <> t.walletDestination)',
      )
      .setParameters({
        remb: TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
        frais: TransactionType.FRAIS,
        retrait: TransactionType.RETRAIT,
      })
      .groupBy('w.id')
      .getRawMany<{
        walletId: string;
        credite: string;
        totalDebits: string;
        rembourse: string;
        frais: string;
        verse: string;
      }>();
    const agregatParWallet = new Map(agregats.map((a) => [a.walletId, a]));

    const rates = await this.platformFees.getRates();

    for (const wallet of wallets) {
      const projetId = wallet.projetId as string;
      const a = agregatParWallet.get(wallet.id);
      const credite = Number(a?.credite ?? 0);
      const rembourse = Number(a?.rembourse ?? 0);
      const frais = Number(a?.frais ?? 0);
      const verse = Number(a?.verse ?? 0);
      const totalDebits = Number(a?.totalDebits ?? 0);
      const collecteBrute = credite - rembourse;
      resultats.set(
        projetId,
        calculerEtatFinancierProjet(projetId, {
          devise: wallet.devise ?? 'EUR',
          credite,
          rembourse,
          fraisRetenus: frais + this.fraisDusSurCollecte(collecteBrute, rates),
          dejaVerse: verse,
          autresDecaissements: Math.max(
            0,
            totalDebits - rembourse - frais - verse,
          ),
          enDelaiReflexion: enDelaiParProjet.get(projetId) ?? 0,
          soldeWalletProjet: Number(wallet.solde),
        }),
      );
    }

    return resultats;
  }

  /** Relecture de l'état financier avec le manager de la transaction en cours. */
  private async etatFinancierDansTransaction(
    manager: EntityManager,
    projetId: string,
    wallet: WalletEntity,
  ): Promise<EtatFinancierProjet> {
    const [
      credite,
      totalDebits,
      rembourse,
      fraisRetenus,
      dejaVerse,
      enDelaiReflexion,
      rates,
    ] = await Promise.all([
      this.sommeTx(manager, { walletDestination: wallet.id }),
      this.sommeTx(manager, { walletSource: wallet.id }),
      this.sommeTx(manager, {
        walletSource: wallet.id,
        type: TransactionType.REMBOURSEMENT_COLLECTE_ECHEC,
      }),
      this.sommeTx(manager, {
        walletSource: wallet.id,
        type: TransactionType.FRAIS,
      }),
      this.sommeTx(manager, {
        walletSource: wallet.id,
        type: TransactionType.RETRAIT,
      }),
      this.sommeEngagementsEnDelai(manager, projetId),
      this.platformFees.getRates(),
    ]);

    const collecteBrute = credite - rembourse;
    return calculerEtatFinancierProjet(projetId, {
      devise: wallet.devise ?? 'EUR',
      credite,
      rembourse,
      fraisRetenus:
        fraisRetenus + this.fraisDusSurCollecte(collecteBrute, rates),
      dejaVerse,
      autresDecaissements: Math.max(
        0,
        totalDebits - rembourse - fraisRetenus - dejaVerse,
      ),
      enDelaiReflexion,
      soldeWalletProjet: Number(wallet.solde),
    });
  }

  /**
   * Σ des montants des transactions RÉUSSIES correspondant au filtre.
   *
   * Les mouvements INTRA-WALLET (source = destination, tel un blocage
   * d'escrow) sont toujours exclus : ils ne font entrer ni sortir aucun euro
   * et les compter gonflerait artificiellement le collecté comme le versé.
   */
  private async sommeTx(
    manager: EntityManager,
    where: {
      walletSource?: string;
      walletDestination?: string;
      type?: TransactionType;
    },
  ): Promise<number> {
    const qb = manager
      .createQueryBuilder(TransactionEntity, 't')
      .select('COALESCE(SUM(t.montant), 0)', 'total')
      .where('t.statut = :statut', { statut: TransactionStatus.REUSSI })
      .andWhere(
        '(t.walletSource IS NULL OR t.walletDestination IS NULL OR t.walletSource <> t.walletDestination)',
      );
    if (where.walletSource) {
      qb.andWhere('t.walletSource = :src', { src: where.walletSource });
    }
    if (where.walletDestination) {
      qb.andWhere('t.walletDestination = :dst', {
        dst: where.walletDestination,
      });
    }
    if (where.type) {
      qb.andWhere('t.type = :type', { type: where.type });
    }
    const raw = await qb.getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  /**
   * Engagements en délai de réflexion pour une PAGE de projets, en UNE requête.
   *
   * Même règle métier que `sommeEngagementsEnDelai`, en lecture groupée : le
   * tableau du back-office ne doit pas produire de N+1. Les projets sans aucun
   * engagement sont simplement absents de la map (le lecteur applique 0).
   */
  private async sommeEngagementsEnDelaiParProjets(
    manager: EntityManager,
    projetIds: string[],
  ): Promise<Map<string, number>> {
    const lignes = await manager
      .createQueryBuilder(InvestmentEntity, 'i')
      .select('i.projetId', 'projetId')
      .addSelect('COALESCE(SUM(i.montant), 0)', 'total')
      .where('i.projetId IN (:...ids)', { ids: projetIds })
      .andWhere('i.statut = :statut', {
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      })
      .groupBy('i.projetId')
      .getRawMany<{ projetId: string; total: string }>();
    return new Map(lignes.map((r) => [r.projetId, Number(r.total)]));
  }

  /** Engagements encore couverts par le délai de réflexion (pas encore acquis). */
  private async sommeEngagementsEnDelai(
    manager: EntityManager,
    projetId: string,
  ): Promise<number> {
    const raw = await manager
      .createQueryBuilder(InvestmentEntity, 'i')
      .select('COALESCE(SUM(i.montant), 0)', 'total')
      .where('i.projetId = :projetId', { projetId })
      .andWhere('i.statut = :statut', {
        statut: InvestmentStatus.EN_DELAI_RETRACTATION,
      })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }
}
